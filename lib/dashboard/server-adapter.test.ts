import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { __testables } from "./server-adapter";

describe("monthly dashboard adapter", () => {
  it("formats persisted instants in the dashboard timezone instead of slicing UTC", () => {
    expect(
      __testables.isoDate(
        new Date("2026-08-31T16:00:00.000Z"),
        "Asia/Shanghai",
      ),
    ).toBe("2026-09-01");
    expect(
      __testables.isoDate(
        new Date("2027-08-31T15:59:59.999Z"),
        "Asia/Shanghai",
      ),
    ).toBe("2027-08-31");
  });

  it("compares the current month to the same number of elapsed days", () => {
    expect(
      __testables.calculatePreviousMonthDelta(
        {
          "2026-07-01": 10_000,
          "2026-07-02": 10_000,
          "2026-07-03": 50_000,
          "2026-08-01": 15_000,
          "2026-08-02": 15_000,
        },
        "2026-08",
        new Date("2026-08-02T12:00:00+08:00"),
      ),
    ).toBe(0.5);
  });

  it("compares completed months through the same day in either length direction", () => {
    const byDate: Record<string, number> = {};
    for (const month of ["2026-01", "2026-02", "2026-03"]) {
      const days = month === "2026-02" ? 28 : 31;
      for (let day = 1; day <= days; day += 1) {
        byDate[`${month}-${String(day).padStart(2, "0")}`] = 1_000;
      }
    }

    const now = new Date("2026-09-01T12:00:00+08:00");
    expect(
      __testables.calculatePreviousMonthDelta(byDate, "2026-02", now),
    ).toBe(0);
    expect(
      __testables.calculatePreviousMonthDelta(byDate, "2026-03", now),
    ).toBe(0);
  });

  it("keeps every category distinct instead of creating a second other bucket", () => {
    const categories = __testables.buildCategories({
      restaurant: 90,
      groceries: 80,
      housing: 70,
      transport: 60,
      shopping: 50,
      leisure: 40,
      other: 30,
    });
    expect(categories).toHaveLength(7);
    expect(categories.filter((item) => item.category === "other")).toHaveLength(1);
  });

  it("prefers the exact active total monthly budget over category, custom, and annual budgets", () => {
    const august = {
      startsAt: new Date("2026-07-31T16:00:00.000Z"),
      endsAt: new Date("2026-08-31T15:59:59.999Z"),
    };
    const raw = {
      budgets: [
        budget("category", { ...august, category: "food", amountFen: 10 }),
        budget("custom", { ...august, periodType: "custom", amountFen: 20 }),
        budget("inactive", { ...august, isActive: false, amountFen: 30 }),
        budget("annual", {
          startsAt: new Date("2025-08-31T16:00:00.000Z"),
          endsAt: august.endsAt,
          periodType: "year",
          amountFen: 120_000,
        }),
        budget("monthly", { ...august, amountFen: 45_000 }),
      ],
      group: null,
    } as never;

    expect(__testables.selectBudget(raw, "personal", "2026-08")).toMatchObject({
      id: "monthly",
      amountFen: 45_000,
    });
  });

  it("prorates a covering legacy annual budget when no exact monthly total exists", () => {
    const raw = {
      budgets: [
        budget("annual", {
          startsAt: new Date("2025-08-31T16:00:00.000Z"),
          endsAt: new Date("2026-06-30T15:59:59.999Z"),
          periodType: "year",
          amountFen: 500_000,
        }),
      ],
      group: null,
    } as never;

    expect(__testables.selectBudget(raw, "personal", "2026-01")).toMatchObject({
      id: "annual",
      amountFen: 50_000,
    });
  });
});

function budget(
  id: string,
  overrides: Partial<{
    groupId: string | null;
    category: string | null;
    periodType: string;
    startsAt: Date;
    endsAt: Date;
    amountFen: number;
    isActive: boolean;
  }> = {},
) {
  return {
    id,
    groupId: null,
    category: null,
    periodType: "month",
    startsAt: new Date("2026-07-31T16:00:00.000Z"),
    endsAt: new Date("2026-08-31T15:59:59.999Z"),
    amountFen: 100,
    isActive: true,
    ...overrides,
  };
}
