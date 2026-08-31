import { describe, expect, it } from "vitest";

import { normalizeTransactionCategory } from "./category";

describe("transaction categories", () => {
  it("separates groceries, restaurants and ambiguous legacy food", () => {
    expect(normalizeTransactionCategory("food", "盒马鲜生")).toBe("groceries");
    expect(normalizeTransactionCategory("food", "海底捞火锅")).toBe("restaurant");
    expect(normalizeTransactionCategory("food", "Unknown food vendor")).toBe("food");
  });

  it("keeps coffee out of the restaurant payment metric", () => {
    expect(normalizeTransactionCategory("food", "Manner Coffee")).toBe("leisure");
  });

  it("preserves an explicit recognized category before reading merchant context", () => {
    expect(normalizeTransactionCategory("shopping", "Coffee machine")).toBe("shopping");
    expect(normalizeTransactionCategory("housing", "Restaurant lease")).toBe("housing");
    expect(normalizeTransactionCategory("other", "Coffee machine")).toBe("other");
  });
});
