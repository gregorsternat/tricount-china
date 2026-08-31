import "server-only";

import { normalizeTransactionCategory } from "@/lib/dashboard/category";
import {
  currentMonthKey,
  dayCount,
  isoDate,
  monthKeysEndingAt,
  monthPeriod,
  shiftMonth,
} from "@/lib/dashboard/period";
import type {
  CategorySpend,
  DashboardScope,
  DashboardSnapshot,
  DashboardTransaction,
  DailySpend,
  MonthlySpend,
  TransactionCategory,
  TransactionSource,
} from "@/lib/dashboard/types";
import type { getDashboardSnapshot } from "@/lib/server/dashboard";

type RawDashboard = Awaited<ReturnType<typeof getDashboardSnapshot>>;

export function adaptDashboardSnapshot({
  raw,
  trendRaw = raw,
  viewer,
  scope,
  month,
  requestedGroupId,
  now = new Date(),
}: {
  readonly raw: RawDashboard;
  readonly trendRaw?: RawDashboard;
  readonly viewer: { id: string; name: string; email: string; image: string | null };
  readonly scope: DashboardScope;
  readonly month: string;
  readonly requestedGroupId?: string;
  readonly now?: Date;
}): DashboardSnapshot {
  const selectedPeriod = monthPeriod(month);
  const group = scope === "group" ? raw.group : null;
  const trendGroup = scope === "group" ? trendRaw.group : null;
  const spendingByDate = group?.analytics.byDate ?? raw.wallet.byDate;
  const trendByDate = trendGroup?.analytics.byDate ?? trendRaw.wallet.byDate;
  const categoryValues = group?.analytics.byCategory ?? raw.wallet.byCategory;
  const categoryCounts = group?.analytics.categoryCounts ?? raw.wallet.categoryCounts;
  const spentFen = group?.analytics.totalExpensesFen ?? raw.wallet.totalSpentFen;
  const budget = selectBudget(raw, scope, month);
  const budgetFen = budget?.amountFen ?? 0;
  const selectedGroupId = group?.id ?? (scope === "group" ? requestedGroupId : undefined);
  const today = isoDate(now);
  const isCurrentMonth = month === currentMonthKey(now);
  const elapsedDays = isCurrentMonth ? Number(today.slice(-2)) : dayCount(month);
  const remainingDays = isCurrentMonth
    ? Math.max(1, dayCount(month) - elapsedDays + 1)
    : 0;
  const restaurantSpendFen = categoryValues.restaurant ?? 0;
  const restaurantPaymentCount = categoryCounts.restaurant ?? 0;

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
    period: {
      key: month,
      startsOn: selectedPeriod.startsOn,
      endsOn: selectedPeriod.endsOn,
      isCurrentMonth,
    },
    spentFen,
    budgetFen,
    metrics: {
      previousMonthDelta: calculatePreviousMonthDelta(trendByDate, month, now),
      averageDailySpendFen: elapsedDays > 0 ? Math.round(spentFen / elapsedDays) : null,
      availablePerDayFen:
        budgetFen > 0 && remainingDays > 0
          ? Math.round(Math.max(0, budgetFen - spentFen) / remainingDays)
          : null,
      restaurantSpendFen,
      restaurantPaymentCount,
      averageRestaurantPaymentFen:
        restaurantPaymentCount > 0
          ? Math.round(restaurantSpendFen / restaurantPaymentCount)
          : null,
      groceriesSpendFen: categoryValues.groceries ?? 0,
      legacyFoodSpendFen: categoryValues.food ?? 0,
    },
    trend: buildMonthlyTrend(trendByDate, month, now),
    daily: buildDailySpend(spendingByDate, month, now),
    categories: buildCategories(categoryValues),
    transactions: group
      ? groupTransactions(group)
      : walletTransactions(raw.wallet.recentTransactions, viewer.name),
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
    biggestDay: normalizeBiggestDay(group?.analytics.biggestDay ?? raw.wallet.biggestDay),
    generatedAt: now.toISOString(),
    revision: Math.max(1, Math.floor(now.getTime() / 1_000)),
  };
}

function buildMonthlyTrend(
  byDate: Record<string, number>,
  month: string,
  now: Date,
): MonthlySpend[] {
  const current = currentMonthKey(now);
  return monthKeysEndingAt(month, 6).map((key) => ({
    key,
    spentFen: sumMonth(byDate, key),
    observed: key <= current,
  }));
}

function buildDailySpend(
  byDate: Record<string, number>,
  month: string,
  now: Date,
): DailySpend[] {
  const current = currentMonthKey(now);
  const todayDay = Number(isoDate(now).slice(-2));
  return Array.from({ length: dayCount(month) }, (_, index) => {
    const day = index + 1;
    const key = `${month}-${String(day).padStart(2, "0")}`;
    return {
      key,
      day,
      spentFen: byDate[key] ?? 0,
      observed: month < current || (month === current && day <= todayDay),
    };
  });
}

function calculatePreviousMonthDelta(
  byDate: Record<string, number>,
  month: string,
  now: Date,
): number | null {
  const previousMonth = shiftMonth(month, -1);
  const isCurrent = month === currentMonthKey(now);
  const availableCurrentDays = isCurrent
    ? Number(isoDate(now).slice(-2))
    : dayCount(month);
  const comparableDays = Math.min(
    availableCurrentDays,
    dayCount(month),
    dayCount(previousMonth),
  );
  const currentFen = sumMonthThroughDay(byDate, month, comparableDays);
  const previousFen = sumMonthThroughDay(byDate, previousMonth, comparableDays);
  return previousFen > 0 ? (currentFen - previousFen) / previousFen : null;
}

function sumMonth(byDate: Record<string, number>, month: string): number {
  return Object.entries(byDate)
    .filter(([key]) => key.startsWith(`${month}-`))
    .reduce((sum, [, amountFen]) => sum + amountFen, 0);
}

function sumMonthThroughDay(
  byDate: Record<string, number>,
  month: string,
  lastDay: number,
): number {
  return Object.entries(byDate)
    .filter(([key]) => key.startsWith(`${month}-`) && Number(key.slice(-2)) <= lastDay)
    .reduce((sum, [, amountFen]) => sum + amountFen, 0);
}

function buildCategories(values: Record<string, number>): CategorySpend[] {
  const normalized = new Map<TransactionCategory, number>();
  for (const [rawCategory, amountFen] of Object.entries(values)) {
    const category = normalizeTransactionCategory(rawCategory);
    normalized.set(category, (normalized.get(category) ?? 0) + amountFen);
  }
  return [...normalized.entries()]
    .filter(([, amountFen]) => amountFen > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([category, amountFen]) => ({ category, amountFen }));
}

function groupTransactions(group: NonNullable<RawDashboard["group"]>): DashboardTransaction[] {
  const memberNames = new Map(group.members.map((member) => [member.id, member.nickname || member.name]));
  return group.expenses.slice(0, 30).map((expense) => ({
    id: expense.id,
    title: expense.title,
    merchant: expense.notes || expense.title,
    occurredAt: expense.occurredAt.toISOString(),
    amountFen: expense.amountBaseFen ?? expense.amountFen,
    category: normalizeTransactionCategory(
      expense.category,
      `${expense.title} ${expense.notes ?? ""}`,
    ),
    source: normalizeSource(expense.source),
    paidBy: memberNames.get(expense.paidByMemberId) ?? "—",
    groupId: group.id,
    shared: true,
    note: expense.notes ?? undefined,
  }));
}

function walletTransactions(
  rows: RawDashboard["wallet"]["recentTransactions"],
  viewerName: string,
): DashboardTransaction[] {
  return rows.map((transaction) => ({
    id: transaction.id,
    title:
      transaction.title ||
      transaction.merchant ||
      transaction.counterparty ||
      transaction.description ||
      "Transaction",
    merchant: transaction.merchant || transaction.counterparty || "",
    occurredAt: transaction.occurredAt.toISOString(),
    amountFen: Math.max(0, transaction.amountFen - (transaction.refundAmountFen ?? 0)),
    category: normalizeTransactionCategory(
      transaction.category,
      [transaction.merchant, transaction.counterparty, transaction.description].filter(Boolean).join(" "),
    ),
    source: normalizeSource(transaction.provider),
    paidBy: viewerName,
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

function topWalletMerchant(merchants: RawDashboard["wallet"]["topMerchants"]) {
  const top = merchants[0];
  return top ? { name: top.label, amountFen: top.amountFen, visits: top.visits } : null;
}

function normalizeBiggestDay(value: { label: string; amountFen: number } | null) {
  return value ? { date: value.label, amountFen: value.amountFen } : null;
}

function selectBudget(raw: RawDashboard, scope: DashboardScope, month: string) {
  const budgets = scope === "personal" ? raw.budgets : raw.group?.budgets ?? [];
  const desiredGroupId = scope === "group" ? raw.group?.id : null;
  const selectedPeriod = monthPeriod(month);
  const eligible = budgets.filter((budget) => {
    const budgetGroupId = readString(budget, "groupId");
    const isActive = readBoolean(budget, "isActive");
    return (
      (desiredGroupId ? budgetGroupId === desiredGroupId : !budgetGroupId) &&
      !readString(budget, "category") &&
      isActive !== false
    );
  });
  const exactMonthly = eligible.find(
    (budget) =>
      readString(budget, "periodType") === "month" &&
      budget.startsAt.getTime() === selectedPeriod.from.getTime() &&
      budget.endsAt.getTime() === selectedPeriod.to.getTime(),
  );
  if (exactMonthly) return exactMonthly;

  const legacyAnnual = eligible
    .filter(
      (budget) =>
        readString(budget, "periodType") === "year" &&
        budget.startsAt <= selectedPeriod.from &&
        budget.endsAt >= selectedPeriod.to,
    )
    .sort(
      (left, right) =>
        left.endsAt.getTime() - left.startsAt.getTime() -
          (right.endsAt.getTime() - right.startsAt.getTime()) ||
        right.startsAt.getTime() - left.startsAt.getTime() ||
        left.id.localeCompare(right.id),
    )[0];
  if (!legacyAnnual) return null;

  return {
    ...legacyAnnual,
    amountFen: Math.round(
      legacyAnnual.amountFen /
        calendarMonthSpan(legacyAnnual.startsAt, legacyAnnual.endsAt),
    ),
  };
}

function calendarMonthSpan(startsAt: Date, endsAt: Date): number {
  const [startYear, startMonth] = isoDate(startsAt).slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = isoDate(endsAt).slice(0, 7).split("-").map(Number);
  return Math.max(1, (endYear - startYear) * 12 + endMonth - startMonth + 1);
}

function normalizeSource(value: string): TransactionSource {
  return value === "wechat" || value === "alipay" ? value : "manual";
}

function timezoneCity(timezone: string) {
  if (timezone === "Asia/Shanghai") return "China";
  return timezone.split("/").at(-1)?.replaceAll("_", " ") ?? "China";
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

function readBoolean(value: unknown, key: string): boolean | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "boolean" ? candidate : undefined;
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

export const __testables = {
  buildCategories,
  buildDailySpend,
  buildMonthlyTrend,
  calculatePreviousMonthDelta,
  calendarMonthSpan,
  isoDate,
  selectBudget,
  sumMonth,
};
