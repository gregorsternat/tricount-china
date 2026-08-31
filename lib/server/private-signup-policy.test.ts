import { describe, expect, it } from "vitest";

import {
  createInvitationToken,
  hashInvitationToken,
  secureTokenMatches,
} from "./private-signup-policy";

describe("private sign-up tokens", () => {
  it("compares valid tokens without accepting a different value", async () => {
    const token = createInvitationToken();

    await expect(secureTokenMatches(token, token)).resolves.toBe(true);
    await expect(
      secureTokenMatches(token, createInvitationToken()),
    ).resolves.toBe(false);
  });

  it("rejects malformed candidates before comparison", async () => {
    await expect(
      secureTokenMatches("too-short", createInvitationToken()),
    ).resolves.toBe(false);
    await expect(
      secureTokenMatches("x".repeat(513), createInvitationToken()),
    ).resolves.toBe(false);
  });

  it("hashes identical invitation tokens deterministically", async () => {
    const token = createInvitationToken();

    await expect(hashInvitationToken(token)).resolves.toBe(
      await hashInvitationToken(token),
    );
  });
});
