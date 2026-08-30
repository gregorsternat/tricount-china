import { describe, expect, it } from "vitest";

import { initials, parseAmountToFen } from "./format";

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
