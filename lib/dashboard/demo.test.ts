import { describe, expect, it } from "vitest";

import { createDemoDashboard } from "./demo";

describe("createDemoDashboard", () => {
  it.each(["personal", "group"] as const)(
    "reconciles monthly and category totals for the %s scope",
    (scope) => {
      const dashboard = createDemoDashboard(scope);

      expect(dashboard.monthly.reduce((sum, month) => sum + month.spentFen, 0)).toBe(
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
});
