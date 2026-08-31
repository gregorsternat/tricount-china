import { describe, expect, it } from "vitest";

import { createDemoDashboard } from "./demo";

describe("createDemoDashboard", () => {
  it.each(["personal", "group"] as const)(
    "reconciles category and daily totals for the %s scope",
    (scope) => {
      const dashboard = createDemoDashboard(scope);

      expect(dashboard.daily.reduce((sum, day) => sum + day.spentFen, 0)).toBe(
        dashboard.spentFen,
      );
      expect(
        dashboard.categories.reduce((sum, category) => sum + category.amountFen, 0),
      ).toBe(dashboard.spentFen);
    },
  );

  it("keeps private wallet transactions distinct from group balances", () => {
    const personal = createDemoDashboard("personal");
    const group = createDemoDashboard("group");

    expect(personal.balances).toEqual([]);
    expect(group.balances.length).toBeGreaterThan(0);
    expect(personal.transactions.some((transaction) => !transaction.shared)).toBe(true);
  });

  it("derives the restaurant metric from native restaurant payments", () => {
    const dashboard = createDemoDashboard("personal", "2026-08");
    expect(dashboard.metrics.restaurantSpendFen).toBe(
      dashboard.categories.find((item) => item.category === "restaurant")?.amountFen,
    );
    expect(dashboard.metrics.averageRestaurantPaymentFen).toBe(
      Math.round(
        dashboard.metrics.restaurantSpendFen /
          dashboard.metrics.restaurantPaymentCount,
      ),
    );
  });

  it("never marks future days or demo transactions as observed", () => {
    const dashboard = createDemoDashboard(
      "personal",
      "2026-09",
      undefined,
      new Date("2026-09-01T12:00:00+08:00"),
    );

    expect(dashboard.daily.filter((day) => day.observed).map((day) => day.day)).toEqual([1]);
    expect(dashboard.daily.reduce((sum, day) => sum + day.spentFen, 0)).toBe(
      dashboard.spentFen,
    );
    expect(
      dashboard.transactions.every((transaction) =>
        transaction.occurredAt.startsWith("2026-09-01"),
      ),
    ).toBe(true);
  });
});
