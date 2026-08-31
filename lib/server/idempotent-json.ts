import "server-only";

import {
  completeIdempotentRequest,
  failIdempotentRequest,
  reserveIdempotencyKey,
} from "./idempotency";
import { HttpError } from "./errors";

export interface IdempotentJsonResult {
  readonly body: unknown;
  /** Optional secret-free representation persisted for later replays. */
  readonly replayBody?: unknown;
  readonly status?: number;
  readonly resourceType?: string;
  readonly resourceId?: string;
}

export interface IdempotentJsonReplayContext {
  readonly idempotencyKey: string;
  readonly responseBody: unknown;
  readonly responseStatus: number;
}

export async function idempotentJson(
  request: Request,
  input: {
    readonly ownerUserId: string;
    readonly scope: string;
    readonly requestBody: unknown;
  },
  operation: (idempotencyKey: string) => Promise<IdempotentJsonResult>,
  replay?: (context: IdempotentJsonReplayContext) => Promise<unknown> | unknown,
): Promise<Response> {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) {
    throw new HttpError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "An Idempotency-Key header is required for this action.",
    );
  }

  const reservation = await reserveIdempotencyKey({
    ownerUserId: input.ownerUserId,
    scope: input.scope,
    key: idempotencyKey,
    requestBody: input.requestBody,
  });
  if (reservation.kind === "replay") {
    const responseBody = replay
      ? await replay({
          idempotencyKey,
          responseBody: reservation.responseBody,
          responseStatus: reservation.responseStatus,
        })
      : reservation.responseBody;
    return privateJson(responseBody, reservation.responseStatus);
  }

  let result: IdempotentJsonResult;
  try {
    result = await operation(idempotencyKey);
  } catch (error) {
    await failIdempotentRequest(reservation.id, input.ownerUserId).catch(
      (failure) => console.error("Failed to release idempotency reservation", failure),
    );
    throw error;
  }

  const status = result.status ?? 200;
  try {
    await completeIdempotentRequest({
      id: reservation.id,
      ownerUserId: input.ownerUserId,
      responseStatus: status,
      responseBody: result.replayBody ?? result.body,
      resourceType: result.resourceType,
      resourceId: result.resourceId,
    });
  } catch (error) {
    // The mutation itself has already succeeded. Keeping the reservation in the
    // processing state prevents an automatic retry from duplicating the write.
    console.error("Failed to persist idempotent response", error);
  }

  return privateJson(result.body, status);
}

function privateJson(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
