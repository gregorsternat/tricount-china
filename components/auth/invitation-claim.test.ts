import { afterEach, describe, expect, it, vi } from "vitest";

import { claimInvitationWithRetry } from "./invitation-claim";

describe("invitation claim recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries a transient response before succeeding", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          status: "claimed",
          invitationId: "invitation-1",
          groupId: "group-1",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimInvitationWithRetry("t".repeat(48))).resolves.toEqual({
      status: "claimed",
      invitationId: "invitation-1",
      groupId: "group-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accepts an explicit already-claimed response as idempotent success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        status: "already_claimed",
        invitationId: "invitation-1",
        groupId: "group-1",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimInvitationWithRetry("t".repeat(48))).resolves.toEqual({
      status: "already_claimed",
      invitationId: "invitation-1",
      groupId: "group-1",
    });
  });

  it("accepts only an explicit bootstrap authorization for the owner flow", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ status: "bootstrap_authorized" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimInvitationWithRetry("t".repeat(48))).resolves.toEqual({
      status: "bootstrap_authorized",
    });
  });

  it.each([
    { claimed: false },
    { claimed: true },
    { status: "claimed" },
    { status: "unknown", invitationId: "invitation-1", groupId: "group-1" },
  ])("rejects an invalid 2xx body instead of trusting response.ok", async (body) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimInvitationWithRetry("t".repeat(48))).rejects.toThrow(
      "invalid success response",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not retry a permanent validation failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimInvitationWithRetry("t".repeat(48))).rejects.toThrow(
      "status 400",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
