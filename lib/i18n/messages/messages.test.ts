import { describe, expect, it } from "vitest";

import { enMessages } from "./en";
import { frMessages } from "./fr";

function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("translation dictionaries", () => {
  it("keeps English and French keys in parity", () => {
    expect(leafPaths(frMessages).sort()).toEqual(leafPaths(enMessages).sort());
  });

  it("contains no empty translations", () => {
    for (const dictionary of [enMessages, frMessages]) {
      const values = leafPaths(dictionary).map((path) =>
        path.split(".").reduce<unknown>(
          (current, key) => (current as Record<string, unknown>)[key],
          dictionary,
        ),
      );
      expect(values.every((value) => typeof value === "string" && value.trim())).toBe(
        true,
      );
    }
  });
});
