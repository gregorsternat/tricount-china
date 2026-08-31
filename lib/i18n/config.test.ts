import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  getIntlLocale,
  isLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "./config";

describe("locale configuration", () => {
  it("uses English by default", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale("de")).toBe("en");
  });

  it("accepts only supported locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "fr"]);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("en-US")).toBe(false);
  });

  it("maps app locales to explicit Intl locales", () => {
    expect(getIntlLocale("en")).toBe("en-GB");
    expect(getIntlLocale("fr")).toBe("fr-FR");
  });
});
