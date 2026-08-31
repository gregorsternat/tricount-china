import { describe, expect, it } from "vitest";

import {
  isMonthKey,
  monthKeysEndingAt,
  monthPeriod,
  shiftMonth,
} from "./period";

describe("calendar month periods", () => {
  it("handles leap years in Shanghai", () => {
    const period = monthPeriod("2028-02");
    expect(period.startsOn).toBe("2028-02-01");
    expect(period.endsOn).toBe("2028-02-29");
    expect(period.from.toISOString()).toBe("2028-01-31T16:00:00.000Z");
    expect(period.to.toISOString()).toBe("2028-02-29T15:59:59.999Z");
  });

  it("crosses December and January", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(monthKeysEndingAt("2027-02", 3)).toEqual([
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("rejects malformed and out-of-range months", () => {
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("1999-12")).toBe(false);
    expect(() => monthPeriod("2026-13")).toThrow("Invalid calendar month");
  });
});
