import { describe, expect, it } from "vitest";

import {
  formatCny,
  formatMonthKey,
  formatPercent,
  formatShortDate,
  initials,
  parseAmountToFen,
  todayInShanghai,
} from "./format";

describe("parseAmountToFen", () => {
  it.each([
    ["100", 10_000],
    ["100,50", 10_050],
    ["0.01", 1],
  ])("convertit %s en fen", (input, expected) => {
    expect(parseAmountToFen(input)).toBe(expected);
  });

  it.each(["", "0", "-2", "1.001", "hello"])(
    "refuse le montant %s",
    (input) => {
      expect(parseAmountToFen(input)).toBeNull();
    },
  );
});

describe("initials", () => {
  it("retient deux initiales", () => {
    expect(initials("léa martin")).toBe("LM");
  });
});

describe("localized formatting", () => {
  it("formats CNY explicitly in English and French", () => {
    expect(formatCny(123_456, false, "en")).toBe("CN¥1,234.56");
    expect(formatCny(123_456, false, "fr")).toBe("1 234,56 CNY");
  });

  it("localizes dates, months, and percentages", () => {
    expect(formatShortDate("2026-08-31", "en")).toBe("31 Aug");
    expect(formatShortDate("2026-08-31", "fr")).toBe("31 août");
    expect(formatMonthKey("2026-02", "en", "long")).toBe("February");
    expect(formatMonthKey("2026-02", "fr", "long")).toBe("février");
    expect(formatPercent(0.125, "en")).toBe("12.5%");
    expect(formatPercent(0.125, "fr")).toBe("12,5 %");
  });

  it("keeps ISO date keys independent from the UI locale", () => {
    expect(todayInShanghai(new Date("2026-08-31T16:30:00.000Z"))).toBe(
      "2026-09-01",
    );
  });
});
