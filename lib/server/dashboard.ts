import "server-only";

import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import { getDb, type AppDatabase } from "@/lib/db/client";
import {
  budgets,
  expenses,
  expenseShares,
  groupMembers,
  groups,
  importBatches,
  settlements,
  users,
  walletExpenseLinks,
  walletTransactions,
} from "@/lib/db/schema";

import { forbidden } from "./errors";

export type DashboardPeriod = {
  from?: Date;
  to?: Date;
};

export type DashboardScope = "personal" | "group";

export async function getDashboardSnapshot(
  userId: string,
  requestedScope: DashboardScope,
  requestedGroupId?: string,
  requestedPeriod: DashboardPeriod = {},
  database: AppDatabase = getDb(),
) {
  const [currentUser] = await database
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!currentUser) throw forbidden();

  const baseGroups = await database
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      emoji: groups.emoji,
      color: groups.color,
      baseCurrency: groups.baseCurrency,
      timezone: groups.timezone,
      academicYearLabel: groups.academicYearLabel,
      startsAt: groups.startsAt,
      endsAt: groups.endsAt,
      isArchived: groups.isArchived,
      role: groupMembers.role,
      membershipId: groupMembers.id,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .where(
      and(
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "active"),
      ),
    )
    .orderBy(groups.isArchived, desc(groups.updatedAt));

  const availableGroupIds = baseGroups.map((group) => group.id);
  const [memberCountRows, groupSpendRows] = availableGroupIds.length
    ? await Promise.all([
        database
          .select({
            groupId: groupMembers.groupId,
            memberCount: count(groupMembers.id),
          })
          .from(groupMembers)
          .where(
            and(
              inArray(groupMembers.groupId, availableGroupIds),
              eq(groupMembers.status, "active"),
            ),
          )
          .groupBy(groupMembers.groupId),
        database
          .select({
            groupId: expenses.groupId,
            spentFen:
              sql<number>`coalesce(sum(coalesce(${expenses.amountBaseFen}, ${expenses.amountFen})), 0)`.mapWith(
                Number,
              ),
          })
          .from(expenses)
          .where(
            and(
              inArray(expenses.groupId, availableGroupIds),
              eq(expenses.status, "active"),
              isNull(expenses.deletedAt),
              requestedPeriod.from
                ? gte(expenses.occurredAt, requestedPeriod.from)
                : undefined,
              requestedPeriod.to
                ? lte(expenses.occurredAt, requestedPeriod.to)
                : undefined,
            ),
          )
          .groupBy(expenses.groupId),
      ])
    : [[], []];
  const memberCountByGroup = new Map(
    memberCountRows.map((row) => [row.groupId, row.memberCount]),
  );
  const spentByGroup = new Map(
    groupSpendRows.map((row) => [row.groupId, row.spentFen]),
  );
  const availableGroups = baseGroups.map((group) => ({
    ...group,
    memberCount: memberCountByGroup.get(group.id) ?? 0,
    spentFen: spentByGroup.get(group.id) ?? 0,
  }));

  const selectedGroup =
    requestedScope === "group"
      ? requestedGroupId
        ? availableGroups.find((group) => group.id === requestedGroupId)
        : availableGroups.find((group) => !group.isArchived) ?? availableGroups[0]
      : undefined;

  if (requestedScope === "group" && requestedGroupId && !selectedGroup) {
    throw forbidden();
  }

  const personalPeriod = defaultStudentYearPeriod();
  const from =
    requestedPeriod.from ??
    (requestedScope === "group" ? selectedGroup?.startsAt : personalPeriod.from) ??
    undefined;
  const to =
    requestedPeriod.to ??
    (requestedScope === "group" ? selectedGroup?.endsAt : personalPeriod.to) ??
    undefined;
  if (from && to && to < from) {
    throw new Error("Dashboard period end must be after its start.");
  }

  const [walletRows, importRows, personalBudgetRows] = await Promise.all([
    getPrivateWalletRows(userId, from, to, database),
    getPrivateImportRows(userId, database),
    database
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.ownerUserId, userId),
          isNull(budgets.groupId),
          eq(budgets.isActive, true),
          from ? gte(budgets.endsAt, from) : undefined,
          to ? lte(budgets.startsAt, to) : undefined,
        ),
      )
      .orderBy(budgets.startsAt),
  ]);
  const wallet = buildWalletSnapshot(
    walletRows,
    selectedGroup?.timezone ?? "Asia/Shanghai",
    importRows,
  );
  const personalBudgetProgress = buildBudgetProgress(
    personalBudgetRows,
    [],
    walletRows,
  );

  if (!selectedGroup) {
    return {
      period: { from: from ?? null, to: to ?? null },
      groups: availableGroups,
      budgets: personalBudgetProgress,
      group: null,
      wallet,
    };
  }

  const [members, allExpenseRows, allSettlementRows, groupBudgetRows] = await Promise.all([
    database
      .select({
        id: groupMembers.id,
        userId: groupMembers.userId,
        role: groupMembers.role,
        nickname: groupMembers.nickname,
        joinedAt: groupMembers.joinedAt,
        name: users.name,
        image: users.image,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(
        and(
          eq(groupMembers.groupId, selectedGroup.id),
          eq(groupMembers.status, "active"),
        ),
      )
      .orderBy(groupMembers.joinedAt),
    database
      .select({
        id: expenses.id,
        createdByUserId: expenses.createdByUserId,
        paidByMemberId: expenses.paidByMemberId,
        title: expenses.title,
        notes: expenses.notes,
        category: expenses.category,
        amountFen: expenses.amountFen,
        amountBaseFen: expenses.amountBaseFen,
        currency: expenses.currency,
        occurredAt: expenses.occurredAt,
        source: expenses.source,
        receiptUrl: expenses.receiptUrl,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.groupId, selectedGroup.id),
          eq(expenses.status, "active"),
          isNull(expenses.deletedAt),
        ),
      )
      .orderBy(desc(expenses.occurredAt)),
    database
      .select({
        id: settlements.id,
        fromMemberId: settlements.fromMemberId,
        toMemberId: settlements.toMemberId,
        amountFen: settlements.amountFen,
        amountBaseFen: settlements.amountBaseFen,
        currency: settlements.currency,
        occurredAt: settlements.occurredAt,
        note: settlements.note,
      })
      .from(settlements)
      .where(
        and(
          eq(settlements.groupId, selectedGroup.id),
          eq(settlements.status, "active"),
          isNull(settlements.deletedAt),
        ),
      )
      .orderBy(desc(settlements.occurredAt)),
    database
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.isActive, true),
          eq(budgets.groupId, selectedGroup.id),
          from ? gte(budgets.endsAt, from) : undefined,
          to ? lte(budgets.startsAt, to) : undefined,
        ),
      )
      .orderBy(desc(budgets.updatedAt), budgets.id)
      .limit(1),
  ]);

  const shareRows = allExpenseRows.length
    ? await database
        .select({
          id: expenseShares.id,
          expenseId: expenseShares.expenseId,
          memberId: expenseShares.memberId,
          amountFen: expenseShares.amountFen,
        })
        .from(expenseShares)
        .innerJoin(expenses, eq(expenseShares.expenseId, expenses.id))
        .where(
          and(
            eq(expenses.groupId, selectedGroup.id),
            eq(expenses.status, "active"),
            isNull(expenses.deletedAt),
          ),
        )
    : [];

  const sharesByExpense = new Map<string, typeof shareRows>();
  for (const share of shareRows) {
    const existing = sharesByExpense.get(share.expenseId) ?? [];
    existing.push(share);
    sharesByExpense.set(share.expenseId, existing);
  }

  const allExpensesWithShares = allExpenseRows.map((expense) => ({
    ...expense,
    shares: sharesByExpense.get(expense.id) ?? [],
  }));
  const expenseRows = allExpensesWithShares.filter((expense) =>
    isWithinPeriod(expense.occurredAt, from, to),
  );
  const settlementRows = allSettlementRows.filter((settlement) =>
    isWithinPeriod(settlement.occurredAt, from, to),
  );
  const groupAnalytics = buildGroupAnalytics(
    members,
    expenseRows,
    settlementRows,
    selectedGroup.timezone,
    allExpensesWithShares,
    allSettlementRows,
  );
  const groupBudgetProgress = buildBudgetProgress(
    groupBudgetRows,
    expenseRows,
    walletRows,
  );

  return {
    period: { from: from ?? null, to: to ?? null },
    groups: availableGroups,
    budgets: personalBudgetProgress,
    group: {
      ...selectedGroup,
      members,
      expenses: expenseRows,
      settlements: settlementRows,
      budgets: [...groupBudgetProgress, ...personalBudgetProgress],
      analytics: groupAnalytics,
    },
    wallet,
  };
}

async function getPrivateWalletRows(
  userId: string,
  from: Date | undefined,
  to: Date | undefined,
  database: AppDatabase,
) {
  return database
    .select({
      id: walletTransactions.id,
      provider: walletTransactions.provider,
      occurredAt: walletTransactions.occurredAt,
      direction: walletTransactions.direction,
      status: walletTransactions.status,
      amountFen: walletTransactions.amountFen,
      refundAmountFen: walletTransactions.refundAmountFen,
      currency: walletTransactions.currency,
      merchant: walletTransactions.merchant,
      counterparty: walletTransactions.counterparty,
      description: walletTransactions.rawDescription,
      paymentMethod: walletTransactions.paymentMethod,
      category: walletTransactions.category,
      subcategory: walletTransactions.subcategory,
      isExcluded: walletTransactions.isExcluded,
      sharedExpenseId: walletExpenseLinks.expenseId,
      sharedGroupId: expenses.groupId,
      linkedExpenseTitle: expenses.title,
    })
    .from(walletTransactions)
    .leftJoin(
      walletExpenseLinks,
      and(
        eq(walletExpenseLinks.walletTransactionId, walletTransactions.id),
        eq(walletExpenseLinks.ownerUserId, userId),
      ),
    )
    .leftJoin(
      expenses,
      and(
        eq(expenses.id, walletExpenseLinks.expenseId),
        eq(expenses.status, "active"),
        isNull(expenses.deletedAt),
      ),
    )
    .where(
      and(
        eq(walletTransactions.ownerUserId, userId),
        from ? gte(walletTransactions.occurredAt, from) : undefined,
        to ? lte(walletTransactions.occurredAt, to) : undefined,
      ),
    )
    .orderBy(desc(walletTransactions.occurredAt));
}

async function getPrivateImportRows(
  userId: string,
  database: AppDatabase,
) {
  return database
    .select({
      provider: importBatches.provider,
      completedAt: importBatches.completedAt,
      createdAt: importBatches.createdAt,
    })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.ownerUserId, userId),
        eq(importBatches.status, "completed"),
      ),
    )
    .orderBy(desc(importBatches.completedAt), desc(importBatches.createdAt));
}

function buildWalletSnapshot<
  T extends {
    provider: string;
    occurredAt: Date;
    direction: string;
    status: string;
    amountFen: number;
    refundAmountFen: number | null;
    category: string;
    merchant: string | null;
    counterparty: string | null;
    description: string | null;
    isExcluded: boolean;
    linkedExpenseTitle: string | null;
  },
  I extends {
    provider: string;
    completedAt: Date | null;
    createdAt: Date;
  },
>(rows: T[], timezone = "Asia/Shanghai", importRows: I[] = []) {
  const spendRows = rows.filter(isSpendTransaction);
  const byCategory = sumBy(
    spendRows,
    (row) => row.category || "uncategorized",
    effectiveWalletSpend,
  );
  const byDate = sumBy(
    spendRows,
    (row) => dateKey(row.occurredAt, timezone),
    effectiveWalletSpend,
  );
  const byWeekday = sumBy(
    spendRows,
    (row) => weekdayKey(row.occurredAt, timezone),
    effectiveWalletSpend,
  );
  const byMerchant = sumBy(
    spendRows,
    (row) => row.merchant ?? row.counterparty ?? row.description ?? "Unknown",
    effectiveWalletSpend,
  );
  const merchantVisits = countBy(
    spendRows,
    (row) => row.merchant ?? row.counterparty ?? row.description ?? "Unknown",
  );
  const totalSpentFen = spendRows.reduce(
    (sum, row) => sum + effectiveWalletSpend(row),
    0,
  );
  const byProvider: Record<
    string,
    {
      transactionCount: number;
      spendCount: number;
      spentFen: number;
      lastImportedAt: Date | null;
    }
  > = Object.fromEntries(
    ["manual", "wechat", "alipay"].map((provider) => [
      provider,
      {
        transactionCount: 0,
        spendCount: 0,
        spentFen: 0,
        lastImportedAt: null,
      },
    ]),
  );
  for (const row of rows) {
    const stats = (byProvider[row.provider] ??= {
      transactionCount: 0,
      spendCount: 0,
      spentFen: 0,
      lastImportedAt: null,
    });
    stats.transactionCount += 1;
    if (isSpendTransaction(row)) {
      stats.spendCount += 1;
      stats.spentFen += effectiveWalletSpend(row);
    }
  }
  for (const row of importRows) {
    const stats = byProvider[row.provider];
    if (!stats) continue;
    const importedAt = row.completedAt ?? row.createdAt;
    if (!stats.lastImportedAt || importedAt > stats.lastImportedAt) {
      stats.lastImportedAt = importedAt;
    }
  }

  return {
    totalSpentFen,
    transactionCount: spendRows.length,
    averageTransactionFen: spendRows.length
      ? Math.round(totalSpentFen / spendRows.length)
      : 0,
    byCategory,
    byDate,
    byWeekday,
    byProvider,
    topMerchants: topEntries(byMerchant, 8).map((merchant) => ({
      ...merchant,
      visits: merchantVisits[merchant.label] ?? 0,
    })),
    biggestDay: topEntries(byDate, 1)[0] ?? null,
    topCategory: topEntries(byCategory, 1)[0] ?? null,
    recentTransactions: spendRows.slice(0, 20).map((row) => ({
      ...row,
      title:
        row.linkedExpenseTitle ??
        (row.provider === "manual" ? row.description : row.merchant) ??
        row.counterparty ??
        row.merchant ??
        row.description ??
        "Transaction",
    })),
  };
}

function buildBudgetProgress(
  budgetRows: Array<typeof budgets.$inferSelect>,
  expenseRows: Array<{
    occurredAt: Date;
    category: string;
    amountFen: number;
    amountBaseFen: number | null;
  }>,
  walletRows: Array<{
    occurredAt: Date;
    category: string;
    direction: string;
    status: string;
    isExcluded: boolean;
    amountFen: number;
    refundAmountFen: number | null;
  }>,
) {
  return budgetRows.map((budget) => {
    const relevantAmount = budget.groupId
      ? expenseRows
          .filter(
            (expense) =>
              expense.occurredAt >= budget.startsAt &&
              expense.occurredAt <= budget.endsAt &&
              (!budget.category || expense.category === budget.category),
          )
          .reduce(
            (sum, expense) => sum + (expense.amountBaseFen ?? expense.amountFen),
            0,
          )
      : walletRows
          .filter(
            (transaction) =>
              isSpendTransaction(transaction) &&
              transaction.occurredAt >= budget.startsAt &&
              transaction.occurredAt <= budget.endsAt &&
              (!budget.category || transaction.category === budget.category),
          )
          .reduce(
            (sum, transaction) => sum + effectiveWalletSpend(transaction),
            0,
          );

    return {
      id: budget.id,
      groupId: budget.groupId,
      name: budget.name,
      category: budget.category,
      periodType: budget.periodType,
      amountFen: budget.amountFen,
      currency: budget.currency,
      startsAt: budget.startsAt,
      endsAt: budget.endsAt,
      spentFen: relevantAmount,
      remainingFen: Math.max(0, budget.amountFen - relevantAmount),
      progressBasisPoints: Math.round(
        (relevantAmount / budget.amountFen) * 10_000,
      ),
      alertThresholdBasisPoints: budget.alertThresholdBasisPoints,
    };
  });
}

function buildGroupAnalytics<
  M extends { id: string },
  E extends {
    amountFen: number;
    amountBaseFen: number | null;
    paidByMemberId: string;
    occurredAt: Date;
    category: string;
    shares: Array<{ memberId: string; amountFen: number }>;
  },
  S extends {
    amountFen: number;
    fromMemberId: string;
    toMemberId: string;
  },
>(
  members: M[],
  expenseRows: E[],
  settlementRows: S[],
  timezone: string,
  ledgerExpenseRows: E[] = expenseRows,
  ledgerSettlementRows: S[] = settlementRows,
) {
  const balances = new Map(members.map((member) => [member.id, 0]));
  for (const expense of ledgerExpenseRows) {
    balances.set(
      expense.paidByMemberId,
      (balances.get(expense.paidByMemberId) ?? 0) + expense.amountFen,
    );
    for (const share of expense.shares) {
      balances.set(
        share.memberId,
        (balances.get(share.memberId) ?? 0) - share.amountFen,
      );
    }
  }
  for (const settlement of ledgerSettlementRows) {
    balances.set(
      settlement.fromMemberId,
      (balances.get(settlement.fromMemberId) ?? 0) + settlement.amountFen,
    );
    balances.set(
      settlement.toMemberId,
      (balances.get(settlement.toMemberId) ?? 0) - settlement.amountFen,
    );
  }

  const byCategory = sumBy(
    expenseRows,
    (expense) => expense.category,
    (expense) => expense.amountBaseFen ?? expense.amountFen,
  );
  const byDate = sumBy(
    expenseRows,
    (expense) => dateKey(expense.occurredAt, timezone),
    (expense) => expense.amountBaseFen ?? expense.amountFen,
  );
  const totalExpensesFen = expenseRows.reduce(
    (sum, expense) => sum + (expense.amountBaseFen ?? expense.amountFen),
    0,
  );

  return {
    totalExpensesFen,
    expenseCount: expenseRows.length,
    averageExpenseFen: expenseRows.length
      ? Math.round(totalExpensesFen / expenseRows.length)
      : 0,
    balances: members.map((member) => ({
      memberId: member.id,
      balanceFen: balances.get(member.id) ?? 0,
    })),
    byCategory,
    byDate,
    byWeekday: sumBy(
      expenseRows,
      (expense) => weekdayKey(expense.occurredAt, timezone),
      (expense) => expense.amountBaseFen ?? expense.amountFen,
    ),
    topCategory: topEntries(byCategory, 1)[0] ?? null,
    biggestDay: topEntries(byDate, 1)[0] ?? null,
  };
}

function isWithinPeriod(
  occurredAt: Date,
  from: Date | undefined,
  to: Date | undefined,
): boolean {
  return (!from || occurredAt >= from) && (!to || occurredAt <= to);
}

function defaultStudentYearPeriod(now = new Date()): {
  from: Date;
  to: Date;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const part = (type: "year" | "month") =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  const year = part("year");
  const month = part("month");
  const startYear = month >= 9 ? year : year - 1;
  return {
    from: new Date(`${startYear}-09-01T00:00:00+08:00`),
    to: new Date(`${startYear + 1}-08-31T23:59:59.999+08:00`),
  };
}

function isSpendTransaction<T extends {
  direction: string;
  status: string;
  isExcluded: boolean;
}>(transaction: T): boolean {
  return (
    transaction.direction === "outflow" &&
    !transaction.isExcluded &&
    ["completed", "partially_refunded"].includes(transaction.status)
  );
}

function effectiveWalletSpend(transaction: {
  amountFen: number;
  refundAmountFen: number | null;
}): number {
  return Math.max(0, transaction.amountFen - (transaction.refundAmountFen ?? 0));
}

function sumBy<T>(
  rows: T[],
  key: (row: T) => string,
  value: (row: T) => number,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const bucket = key(row);
    totals[bucket] = (totals[bucket] ?? 0) + value(row);
  }
  return totals;
}

function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const bucket = key(row);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
}

function topEntries(values: Record<string, number>, limit: number) {
  return Object.entries(values)
    .map(([label, amountFen]) => ({ label, amountFen }))
    .sort((left, right) => right.amountFen - left.amountFen || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function dateKey(date: Date, timezone: string): string {
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

function weekdayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);
}

export const __testables = {
  buildWalletSnapshot,
  buildGroupAnalytics,
  defaultStudentYearPeriod,
  effectiveWalletSpend,
  isSpendTransaction,
  isWithinPeriod,
};
