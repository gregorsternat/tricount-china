import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));

import { __testables } from "./dashboard";

describe("dashboard periods and ledger balances", () => {
  it("uses a stable Shanghai calendar month for personal scope", () => {
    const august = __testables.defaultCalendarMonthPeriod(
      new Date("2026-08-31T12:00:00+08:00"),
    );
    const september = __testables.defaultCalendarMonthPeriod(
      new Date("2026-09-01T12:00:00+08:00"),
    );

    expect(august.from.toISOString()).toBe("2026-07-31T16:00:00.000Z");
    expect(august.to.toISOString()).toBe("2026-08-31T15:59:59.999Z");
    expect(september.from.toISOString()).toBe("2026-08-31T16:00:00.000Z");
    expect(september.to.toISOString()).toBe("2026-09-30T15:59:59.999Z");
  });

  it("keeps all-time active ledger rows in balances while period analytics stay filtered", () => {
    const analytics = __testables.buildGroupAnalytics(
      [{ id: "member-1" }, { id: "member-2" }],
      [],
      [],
      "Asia/Shanghai",
      [
        {
          amountFen: 900,
          amountBaseFen: null,
          paidByMemberId: "member-1",
          occurredAt: new Date("2027-09-01T12:00:00+08:00"),
          category: "travel",
          shares: [
            { memberId: "member-1", amountFen: 450 },
            { memberId: "member-2", amountFen: 450 },
          ],
        },
      ],
      [
        {
          amountFen: 200,
          fromMemberId: "member-2",
          toMemberId: "member-1",
        },
      ],
    );

    expect(analytics.totalExpensesFen).toBe(0);
    expect(analytics.expenseCount).toBe(0);
    expect(analytics.balances).toEqual([
      { memberId: "member-1", balanceFen: 250 },
      { memberId: "member-2", balanceFen: -250 },
    ]);
  });

  it("counts only final shareable wallet outflows in spend totals", () => {
    const transaction = (status: string) => ({
      direction: "outflow",
      status,
      isExcluded: false,
    });

    expect(__testables.isSpendTransaction(transaction("completed"))).toBe(true);
    expect(
      __testables.isSpendTransaction(transaction("partially_refunded")),
    ).toBe(true);
    expect(__testables.isSpendTransaction(transaction("refunded"))).toBe(false);
    expect(__testables.isSpendTransaction(transaction("unknown"))).toBe(false);
    expect(__testables.isSpendTransaction(transaction("pending"))).toBe(false);
  });

  it("keeps merchant visit counts across the full period, beyond the recent feed", () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      provider: "wechat",
      occurredAt: new Date(`2026-08-${String(index + 1).padStart(2, "0")}T12:00:00+08:00`),
      direction: "outflow",
      status: "completed",
      amountFen: 1_000,
      refundAmountFen: null,
      category: "food",
      merchant: "Campus restaurant",
      counterparty: null,
      description: null,
      isExcluded: false,
      linkedExpenseTitle: null,
    }));

    const wallet = __testables.buildWalletSnapshot(rows);

    expect(wallet.recentTransactions).toHaveLength(20);
    expect(wallet.topMerchants[0]).toEqual({
      label: "Campus restaurant",
      amountFen: 25_000,
      visits: 25,
    });
    expect(wallet.byCategory.restaurant).toBe(25_000);
    expect(wallet.categoryCounts.restaurant).toBe(25);
  });

  it("uses normalized categories when calculating category budget progress", () => {
    const startsAt = new Date("2026-08-01T00:00:00+08:00");
    const endsAt = new Date("2026-08-31T23:59:59.999+08:00");
    const timestamps = {
      createdAt: startsAt,
      updatedAt: startsAt,
    };
    const budgetDefaults = {
      ownerUserId: "owner-1",
      name: "Category budget",
      periodType: "month" as const,
      amountFen: 10_000,
      currency: "CNY",
      startsAt,
      endsAt,
      rollover: false,
      alertThresholdBasisPoints: 8_000,
      isActive: true,
      ...timestamps,
    };

    const [groupBudget] = __testables.buildBudgetProgress(
      [{
        ...budgetDefaults,
        id: "restaurant-budget",
        groupId: "group-1",
        category: "restaurant",
      }],
      [{
        occurredAt: new Date("2026-08-12T12:00:00+08:00"),
        category: "food",
        title: "Campus restaurant",
        notes: null,
        amountFen: 2_500,
        amountBaseFen: null,
      }],
      [],
    );
    expect(groupBudget.spentFen).toBe(2_500);

    const [personalBudget] = __testables.buildBudgetProgress(
      [{
        ...budgetDefaults,
        id: "groceries-budget",
        groupId: null,
        category: "groceries",
      }],
      [],
      [{
        occurredAt: new Date("2026-08-13T12:00:00+08:00"),
        category: "food",
        merchant: "盒马鲜生",
        counterparty: null,
        description: null,
        direction: "outflow",
        status: "completed",
        isExcluded: false,
        amountFen: 3_000,
        refundAmountFen: null,
      }],
    );
    expect(personalBudget.spentFen).toBe(3_000);
  });
});
