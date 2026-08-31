import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/server/errors";

const mocks = vi.hoisted(() => ({
  claimInvitationForUser: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth-session", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));
vi.mock("@/lib/server/invitations", () => ({
  claimInvitationForUser: mocks.claimInvitationForUser,
}));

import { POST } from "./route";

const TOKEN = "t".repeat(48);

function claimRequest(body: unknown, includeOrigin = true): Request {
  return new Request("http://localhost:3000/api/invitations/claim", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(includeOrigin ? { Origin: "http://localhost:3000" } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/invitations/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "friend@example.com",
      name: "Friend",
      image: null,
    });
    mocks.claimInvitationForUser.mockResolvedValue({
      status: "claimed",
      invitationId: "invitation-1",
      groupId: "group-1",
    });
  });

  it("claims only for the authenticated user and disables caching", async () => {
    const response = await POST(claimRequest({ token: TOKEN }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "claimed",
      invitationId: "invitation-1",
      groupId: "group-1",
    });
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(mocks.claimInvitationForUser).toHaveBeenCalledWith(
      "user-1",
      "friend@example.com",
      TOKEN,
    );
  });

  it("returns an explicit idempotent status for an invitation already claimed by this user", async () => {
    mocks.claimInvitationForUser.mockResolvedValue({
      status: "already_claimed",
      invitationId: "invitation-1",
      groupId: "group-1",
    });

    const response = await POST(claimRequest({ token: TOKEN }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "already_claimed",
      invitationId: "invitation-1",
      groupId: "group-1",
    });
  });

  it("keeps the private owner bootstrap flow explicit", async () => {
    mocks.claimInvitationForUser.mockResolvedValue({
      status: "bootstrap_authorized",
    });

    const response = await POST(claimRequest({ token: TOKEN }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "bootstrap_authorized",
    });
  });

  it.each([
    [404, "INVITATION_NOT_FOUND"],
    [409, "INVITATION_EMAIL_MISMATCH"],
    [409, "INVITATION_ALREADY_CLAIMED"],
    [410, "INVITATION_EXPIRED"],
    [410, "INVITATION_REVOKED"],
  ] as const)(
    "returns %i when claiming fails with %s",
    async (status, code) => {
      mocks.claimInvitationForUser.mockRejectedValue(
        new HttpError(status, code, "Invitation cannot be claimed."),
      );

      const response = await POST(claimRequest({ token: TOKEN }));

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({
        error: { code, message: "Invitation cannot be claimed." },
      });
    },
  );

  it("rejects cross-origin mutations before authenticating", async () => {
    const response = await POST(claimRequest({ token: TOKEN }, false));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(mocks.requireAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("validates the exact token payload before claiming", async () => {
    const response = await POST(claimRequest({ token: "short", extra: true }));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(mocks.claimInvitationForUser).not.toHaveBeenCalled();
  });
});
