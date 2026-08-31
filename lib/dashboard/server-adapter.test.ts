import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { __testables } from "./server-adapter";

describe("dashboard academic dates", () => {
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
});
