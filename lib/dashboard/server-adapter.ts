import "server-only";

import type {
  CategorySpend,
  DashboardScope,
  DashboardSnapshot,
  DashboardTransaction,
  MonthlySpend,
  TransactionCategory,
  TransactionSource,
} from "@/lib/dashboard/types";
import type { getDashboardSnapshot } from "@/lib/server/dashboard";

type RawDashboard = Awaited<ReturnType<typeof getDashboardSnapshot>>;

const categoryMeta: Record<TransactionCategory, { label: string; color: string }> = {
  food: { label: "Restaurants & courses", color: "#173f35" },
  housing: { label: "Logement", color: "#8fcf52" },
  travel: { label: "Voyages", color: "#e9945e" },
  transport: { label: "Transports", color: "#8acac2" },
  shopping: { label: "Shopping", color: "#d9ba76" },
  leisure: { label: "Loisirs", color: "#a89ac7" },
  health: { label: "Santé", color: "#d58883" },
  other: { label: "Autres", color: "#e8dfce" },
};

const monthLabels = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

export function adaptDashboardSnapshot({
  raw,
  viewer,
  scope,
  requestedGroupId,
  now = new Date(),
}: {
  readonly raw: RawDashboard;
  readonly viewer: { id: string; name: string; email: string; image: string | null };
  readonly scope: DashboardScope;
  readonly requestedGroupId?: string;
  readonly now?: Date;
}): DashboardSnapshot {
  const period = resolveAcademicPeriod(raw, now);
  const group = scope === "group" ? raw.group : null;
  const spendingByDate = group?.analytics.byDate ?? raw.wallet.byDate;
  const spentFen = group?.analytics.totalExpensesFen ?? raw.wallet.totalSpentFen;
  const budget = selectBudget(raw, scope);
  const budgetFen = budget?.amountFen ?? 0;
  const monthly = buildMonthlySpend(spendingByDate, period.startsOn, budgetFen);
  const categoryValues = group?.analytics.byCategory ?? raw.wallet.byCategory;
  const categories = buildCategories(categoryValues);
  const selectedGroupId = group?.id ?? (scope === "group" ? requestedGroupId : undefined);

  return {
    viewer: {
      id: viewer.id,
      name: viewer.name,
      email: viewer.email,
      avatarUrl: viewer.image ?? undefined,
    },
    scope,
    groups: raw.groups.map((item) => ({
      id: item.id,
      name: item.name,
      city: item.description?.trim() || timezoneCity(item.timezone),
      memberCount: readNumber(item, "memberCount") ?? (group?.id === item.id ? group.members.length : 1),
      spentFen: readNumber(item, "spentFen") ?? (group?.id === item.id ? group.analytics.totalExpensesFen : 0),
      accent: item.color,
    })),
    selectedGroupId,
    academicYear: period,
    spentFen,
    budgetFen,
    previousPeriodDelta: null,
    monthly,
    categories,
    transactions: group
      ? groupTransactions(group)
      : walletTransactions(raw.wallet.recentTransactions),
    balances: group
      ? group.members.map((member) => ({
          id: member.id,
          name: member.nickname || member.name,
          avatarUrl: member.image ?? undefined,
          isCurrentUser: member.userId === viewer.id,
          balanceFen:
            group.analytics.balances.find((balance) => balance.memberId === member.id)
              ?.balanceFen ?? 0,
        }))
      : [],
    imports: buildImportStatuses(raw),
    topMerchant: group
      ? topGroupExpense(group.expenses)
      : topWalletMerchant(raw.wallet.topMerchants),
    busiestDay: topWeekday(group?.analytics.byWeekday ?? raw.wallet.byWeekday),
    generatedAt: now.toISOString(),
    revision: Math.max(1, Math.floor(now.getTime() / 1_000)),
  };
}

function resolveAcademicPeriod(raw: RawDashboard, now: Date) {
  const group = raw.group;
  const timezone = group?.timezone ?? "Asia/Shanghai";
  const suppliedStart = raw.period.from ?? group?.startsAt ?? null;
  const suppliedEnd = raw.period.to ?? group?.endsAt ?? null;

  const [currentYear, currentMonth] = isoDate(now, timezone)
    .split("-")
    .map(Number);
  const startYear = currentMonth >= 9 ? currentYear : currentYear - 1;
  const startsOn = suppliedStart ?? new Date(`${startYear}-09-01T00:00:00+08:00`);
  const endsOn = suppliedEnd ?? new Date(`${startYear + 1}-08-31T23:59:59.999+08:00`);
  const startsOnDate = isoDate(startsOn, timezone);
  const endsOnDate = isoDate(endsOn, timezone);
  const label =
    group?.academicYearLabel ||
    `${startsOnDate.slice(0, 4)}–${endsOnDate.slice(0, 4)}`;

  return {
    label,
    startsOn: startsOnDate,
    endsOn: endsOnDate,
  };
}

function buildMonthlySpend(
  byDate: Record<string, number>,
  startsOn: string,
  annualBudgetFen: number,
): MonthlySpend[] {
  const [year, month] = startsOn.split("-").map(Number);
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const spentFen = Object.entries(byDate)
      .filter(([dateKey]) => dateKey.startsWith(`${key}-`))
      .reduce((sum, [, amountFen]) => sum + amountFen, 0);
    return {
      key,
      label: monthLabels[date.getUTCMonth()] ?? key,
      spentFen,
      budgetFen: annualBudgetFen > 0 ? Math.round(annualBudgetFen / 12) : 0,
      observed: spentFen > 0,
    };
  });

  return months;
}

function buildCategories(values: Record<string, number>): CategorySpend[] {
  const normalized = new Map<TransactionCategory, number>();
  for (const [rawCategory, amountFen] of Object.entries(values)) {
    const category = normalizeCategory(rawCategory);
    normalized.set(category, (normalized.get(category) ?? 0) + amountFen);
  }

  const ranked = [...normalized.entries()]
    .filter(([, amountFen]) => amountFen > 0)
    .sort((left, right) => right[1] - left[1]);
  if (ranked.length <= 5) {
    return ranked.map(([category, amountFen]) => ({ category, amountFen, ...categoryMeta[category] }));
  }

  const leading = ranked.slice(0, 4);
  const otherFen = ranked.slice(4).reduce((sum, [, amountFen]) => sum + amountFen, 0);
  return [
    ...leading.map(([category, amountFen]) => ({ category, amountFen, ...categoryMeta[category] })),
    { category: "other", amountFen: otherFen, ...categoryMeta.other },
  ];
}

function groupTransactions(group: NonNullable<RawDashboard["group"]>): DashboardTransaction[] {
  const memberNames = new Map(group.members.map((member) => [member.id, member.nickname || member.name]));
  return group.expenses.slice(0, 30).map((expense) => ({
    id: expense.id,
    title: expense.title,
    merchant: expense.notes || expense.title,
    occurredAt: expense.occurredAt.toISOString(),
    amountFen: expense.amountBaseFen ?? expense.amountFen,
    category: normalizeCategory(expense.category),
    source: normalizeSource(expense.source),
    paidBy: memberNames.get(expense.paidByMemberId) ?? "Membre",
    groupId: group.id,
    shared: true,
    note: expense.notes ?? undefined,
  }));
}

function walletTransactions(
  rows: RawDashboard["wallet"]["recentTransactions"],
): DashboardTransaction[] {
  return rows.map((transaction) => ({
    id: transaction.id,
    title:
      transaction.title ||
      transaction.merchant ||
      transaction.counterparty ||
      transaction.description ||
      "Transaction importée",
    merchant: transaction.merchant || transaction.counterparty || "Portefeuille",
    occurredAt: transaction.occurredAt.toISOString(),
    amountFen: Math.max(0, transaction.amountFen - (transaction.refundAmountFen ?? 0)),
    category: normalizeCategory(transaction.category),
    source: normalizeSource(transaction.provider),
    paidBy: "Moi",
    groupId: readString(transaction, "sharedGroupId"),
    shared: Boolean(readString(transaction, "sharedGroupId")),
  }));
}

function buildImportStatuses(raw: RawDashboard): DashboardSnapshot["imports"] {
  const enriched = readRecord(raw.wallet, "byProvider");
  return (["wechat", "alipay"] as const).map((source) => {
    const value = enriched?.[source];
    const matching = raw.wallet.recentTransactions.filter((transaction) => transaction.provider === source);
    return {
      source,
      transactionCount: readNumber(value, "transactionCount") ?? matching.length,
      lastImportedAt:
        readDate(value, "lastImportedAt")?.toISOString() ??
        matching[0]?.occurredAt.toISOString(),
    };
  });
}

function topGroupExpense(expenses: NonNullable<RawDashboard["group"]>["expenses"]) {
  const totals = new Map<string, { amountFen: number; visits: number }>();
  for (const expense of expenses) {
    const current = totals.get(expense.title) ?? { amountFen: 0, visits: 0 };
    current.amountFen += expense.amountBaseFen ?? expense.amountFen;
    current.visits += 1;
    totals.set(expense.title, current);
  }
  const top = [...totals.entries()].sort((left, right) => right[1].amountFen - left[1].amountFen)[0];
  return top ? { name: top[0], ...top[1] } : null;
}

function topWalletMerchant(
  merchants: RawDashboard["wallet"]["topMerchants"],
) {
  const top = merchants[0];
  if (!top) return null;
  return { name: top.label, amountFen: top.amountFen, visits: top.visits };
}

function topWeekday(values: Record<string, number>) {
  const top = Object.entries(values).sort((left, right) => right[1] - left[1])[0];
  if (!top) return null;
  const labels: Record<string, string> = {
    Mon: "Lundi",
    Tue: "Mardi",
    Wed: "Mercredi",
    Thu: "Jeudi",
    Fri: "Vendredi",
    Sat: "Samedi",
    Sun: "Dimanche",
  };
  return { label: labels[top[0]] ?? top[0], amountFen: top[1] };
}

function selectBudget(raw: RawDashboard, scope: DashboardScope) {
  const budgets = scope === "personal" ? raw.budgets : raw.group?.budgets ?? [];
  const desiredGroupId = scope === "group" ? raw.group?.id : null;
  return budgets.find((budget) => {
    const budgetGroupId = readString(budget, "groupId");
    return desiredGroupId ? budgetGroupId === desiredGroupId : !budgetGroupId;
  }) ?? budgets[0];
}

function normalizeCategory(value: string): TransactionCategory {
  const normalized = value.trim().toLowerCase();
  if (["food", "restaurant", "restaurants", "groceries", "餐饮", "courses"].includes(normalized)) return "food";
  if (["transport", "taxi", "metro", "train", "交通"].includes(normalized)) return "transport";
  if (["housing", "rent", "home", "logement", "房租"].includes(normalized)) return "housing";
  if (["shopping", "购物"].includes(normalized)) return "shopping";
  if (["leisure", "coffee", "loisirs", "娱乐"].includes(normalized)) return "leisure";
  if (["travel", "trip", "voyage", "旅行"].includes(normalized)) return "travel";
  if (["health", "santé", "医疗"].includes(normalized)) return "health";
  return "other";
}

function normalizeSource(value: string): TransactionSource {
  return value === "wechat" || value === "alipay" ? value : "manual";
}

function timezoneCity(timezone: string) {
  if (timezone === "Asia/Shanghai") return "中国";
  return timezone.split("/").at(-1)?.replaceAll("_", " ") ?? "Chine";
}

function isoDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function readNumber(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" ? candidate : undefined;
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function readDate(value: unknown, key: string): Date | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return candidate instanceof Date ? candidate : undefined;
}

function readRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : undefined;
}

export const __testables = { isoDate, resolveAcademicPeriod };
