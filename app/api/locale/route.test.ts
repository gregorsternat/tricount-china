import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { LOCALE_COOKIE_MAX_AGE } from "@/lib/i18n/config";

import { POST } from "./route";

function localeRequest(body: unknown, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/locale", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/locale", () => {
  it.each(["en", "fr"] as const)("persists the %s locale", async (locale) => {
    const response = await POST(localeRequest({ locale }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ locale });
    expect(response.headers.get("set-cookie")).toContain(`fen_locale=${locale}`);
    expect(response.headers.get("set-cookie")).toContain(
      `Max-Age=${LOCALE_COOKIE_MAX_AGE}`,
    );
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });

  it("rejects unsupported locales and extra data", async () => {
    const response = await POST(localeRequest({ locale: "de", admin: true }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects cross-origin changes", async () => {
    const response = await POST(
      localeRequest({ locale: "fr" }, "https://malicious.example"),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
