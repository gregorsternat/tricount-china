import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db/client", () => ({ getDb: vi.fn() }));

import { authorizePrivateSignup } from "./invitations";

const OWNER_EMAIL = "owner@example.com";
const BOOTSTRAP_TOKEN = "b".repeat(48);
const INVITATION_TOKEN = "i".repeat(48);

function databaseReturning(
  invitation?: {
    id: string;
    groupId: string;
    role: "admin" | "member";
  },
) {
  const limit = vi.fn(async () => (invitation ? [invitation] : []));
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return { database: { select }, select };
}

describe("private sign-up authorization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts an exact database invitation before the bootstrap fallback", async () => {
    vi.stubEnv("PRIVATE_SIGNUP_EMAILS", OWNER_EMAIL);
    vi.stubEnv("PRIVATE_SIGNUP_BOOTSTRAP_TOKEN", BOOTSTRAP_TOKEN);
    const { database, select } = databaseReturning({
      id: "invitation-1",
      groupId: "group-1",
      role: "member",
    });

    await expect(
      authorizePrivateSignup(
        { email: OWNER_EMAIL, invitationToken: INVITATION_TOKEN },
        database as unknown as Parameters<typeof authorizePrivateSignup>[1],
      ),
    ).resolves.toEqual({
      kind: "invitation",
      email: OWNER_EMAIL,
      invitationId: "invitation-1",
      groupId: "group-1",
      role: "member",
    });
    expect(select).toHaveBeenCalledOnce();
  });

  it("falls back to the bootstrap token for an allowlisted email", async () => {
    vi.stubEnv("PRIVATE_SIGNUP_EMAILS", ` ${OWNER_EMAIL.toUpperCase()} `);
    vi.stubEnv("PRIVATE_SIGNUP_BOOTSTRAP_TOKEN", BOOTSTRAP_TOKEN);
    const { database, select } = databaseReturning();

    await expect(
      authorizePrivateSignup(
        { email: OWNER_EMAIL, invitationToken: BOOTSTRAP_TOKEN },
        database as unknown as Parameters<typeof authorizePrivateSignup>[1],
      ),
    ).resolves.toEqual({ kind: "allowlist", email: OWNER_EMAIL });
    expect(select).toHaveBeenCalledOnce();
  });

  it("rejects an allowlisted email without the matching bootstrap token", async () => {
    vi.stubEnv("PRIVATE_SIGNUP_EMAILS", OWNER_EMAIL);
    vi.stubEnv("PRIVATE_SIGNUP_BOOTSTRAP_TOKEN", BOOTSTRAP_TOKEN);
    const { database } = databaseReturning();

    await expect(
      authorizePrivateSignup(
        { email: OWNER_EMAIL, invitationToken: INVITATION_TOKEN },
        database as unknown as Parameters<typeof authorizePrivateSignup>[1],
      ),
    ).resolves.toBeNull();
  });
});
