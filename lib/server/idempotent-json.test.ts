import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  reserveIdempotencyKey,
  completeIdempotentRequest,
  failIdempotentRequest,
} = vi.hoisted(() => ({
  reserveIdempotencyKey: vi.fn(),
  completeIdempotentRequest: vi.fn(),
  failIdempotentRequest: vi.fn(),
}));

vi.mock("./idempotency", () => ({
  reserveIdempotencyKey,
  completeIdempotentRequest,
  failIdempotentRequest,
}));

import { idempotentJson } from "./idempotent-json";

describe("idempotentJson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reserveIdempotencyKey.mockResolvedValue({ kind: "started", id: "reservation-1" });
    completeIdempotentRequest.mockResolvedValue(undefined);
    failIdempotentRequest.mockResolvedValue(undefined);
  });

  it("returns the full first response but persists only the secret-free replay body", async () => {
    const response = await idempotentJson(
      new Request("https://fen.example/api/groups", {
        method: "POST",
        headers: { "idempotency-key": "request-123" },
      }),
      { ownerUserId: "user-1", scope: "group.create", requestBody: { name: "Coloc" } },
      async () => ({
        body: { invitationUrl: "https://fen.example/join?token=secret" },
        replayBody: { message: "Already created" },
        status: 201,
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      invitationUrl: "https://fen.example/join?token=secret",
    });
    expect(completeIdempotentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ responseBody: { message: "Already created" } }),
    );
  });

  it("returns a previously stored replay without running the operation", async () => {
    reserveIdempotencyKey.mockResolvedValueOnce({
      kind: "replay",
      id: "reservation-1",
      responseStatus: 200,
      responseBody: { message: "Already created" },
    });
    const operation = vi.fn();

    const response = await idempotentJson(
      new Request("https://fen.example/api/groups", {
        method: "POST",
        headers: { "idempotency-key": "request-123" },
      }),
      { ownerUserId: "user-1", scope: "group.create", requestBody: { name: "Coloc" } },
      operation,
    );

    expect(operation).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ message: "Already created" });
  });

  it("can reconstruct a secret response on replay without storing that secret", async () => {
    reserveIdempotencyKey.mockResolvedValueOnce({
      kind: "replay",
      id: "reservation-1",
      responseStatus: 201,
      responseBody: { invitationId: "invitation-1" },
    });
    const operation = vi.fn();
    const replay = vi.fn(async ({ idempotencyKey, responseBody }) => ({
      ...responseBody,
      invitationUrl: `https://fen.example/join?token=derived-${idempotencyKey}`,
    }));

    const response = await idempotentJson(
      new Request("https://fen.example/api/groups/group-1/invitations", {
        method: "POST",
        headers: { "idempotency-key": "request-123" },
      }),
      {
        ownerUserId: "user-1",
        scope: "group.invitation.create",
        requestBody: { groupId: "group-1", email: "friend@example.com" },
      },
      operation,
      replay,
    );

    expect(operation).not.toHaveBeenCalled();
    expect(replay).toHaveBeenCalledWith({
      idempotencyKey: "request-123",
      responseBody: { invitationId: "invitation-1" },
      responseStatus: 201,
    });
    await expect(response.json()).resolves.toEqual({
      invitationId: "invitation-1",
      invitationUrl: "https://fen.example/join?token=derived-request-123",
    });
  });
});
