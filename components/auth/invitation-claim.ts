"use client";

const RETRY_DELAYS_MS = [0, 150, 450] as const;

export type InvitationClaimResponse =
  | {
      status: "claimed" | "already_claimed";
      invitationId: string;
      groupId: string;
    }
  | { status: "bootstrap_authorized" };

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isRetryableStatus(status: number): boolean {
  return (
    status === 401 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

export async function claimInvitationWithRetry(
  token: string,
): Promise<InvitationClaimResponse> {
  let lastError: unknown;

  for (const [attempt, delayMs] of RETRY_DELAYS_MS.entries()) {
    if (delayMs > 0) await wait(delayMs);

    let response: Response;
    try {
      response = await fetch("/api/invitations/claim", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length - 1) break;
      continue;
    }

    if (response.ok) {
      const body: unknown = await response.json().catch(() => undefined);
      const claim = parseInvitationClaimResponse(body);
      if (!claim) {
        throw new Error(
          "Invitation claim returned an invalid success response.",
        );
      }
      return claim;
    }

    const error = new Error(
      `Invitation claim failed with status ${response.status}.`,
    );
    if (!isRetryableStatus(response.status)) throw error;
    lastError = error;

    if (attempt === RETRY_DELAYS_MS.length - 1) break;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Invitation claim failed.");
}

function parseInvitationClaimResponse(
  value: unknown,
): InvitationClaimResponse | null {
  if (!isRecord(value) || typeof value.status !== "string") return null;

  if (value.status === "bootstrap_authorized") {
    return { status: "bootstrap_authorized" };
  }

  if (
    (value.status === "claimed" || value.status === "already_claimed") &&
    typeof value.invitationId === "string" &&
    value.invitationId.length > 0 &&
    typeof value.groupId === "string" &&
    value.groupId.length > 0
  ) {
    return {
      status: value.status,
      invitationId: value.invitationId,
      groupId: value.groupId,
    };
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
