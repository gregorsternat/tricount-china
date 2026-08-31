import "server-only";

import { and, eq, lte } from "drizzle-orm";

import { getDb, type AppDatabase } from "@/lib/db/client";
import { idempotencyKeys } from "@/lib/db/schema";

import { conflict } from "./errors";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export type IdempotencyReservation =
  | { kind: "started"; id: string }
  | {
      kind: "replay";
      id: string;
      responseStatus: number;
      responseBody: unknown;
    };

export async function reserveIdempotencyKey(
  input: {
    ownerUserId: string;
    scope: string;
    key: string;
    requestBody: unknown;
    ttlMs?: number;
  },
  database: AppDatabase = getDb(),
): Promise<IdempotencyReservation> {
  const scope = input.scope.trim();
  const key = input.key.trim();
  if (!/^[a-z0-9._:-]{1,100}$/iu.test(scope)) {
    throw new Error("Invalid idempotency scope.");
  }
  if (key.length < 8 || key.length > 200) {
    throw new Error("Idempotency key must contain between 8 and 200 characters.");
  }
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  if (ttlMs < 60_000 || ttlMs > MAX_TTL_MS) {
    throw new Error("Idempotency TTL must be between one minute and seven days.");
  }

  const [keyHash, requestHash] = await Promise.all([
    sha256(key),
    sha256(stableStringify(input.requestBody)),
  ]);
  const now = new Date();
  const [existing] = await database
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.ownerUserId, input.ownerUserId),
        eq(idempotencyKeys.scope, scope),
        eq(idempotencyKeys.keyHash, keyHash),
      ),
    )
    .limit(1);

  if (existing && existing.expiresAt > now) {
    return reuseActiveReservation(
      existing,
      requestHash,
      ttlMs,
      database,
    );
  }

  if (existing) {
    await database
      .delete(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.id, existing.id),
          lte(idempotencyKeys.expiresAt, now),
        ),
      );
  }

  const id = crypto.randomUUID();
  const inserted = await database
    .insert(idempotencyKeys)
    .values({
      id,
      ownerUserId: input.ownerUserId,
      scope,
      keyHash,
      requestHash,
      expiresAt: new Date(Date.now() + ttlMs),
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });
  if (inserted.length > 0) return { kind: "started", id };

  const [concurrent] = await database
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.ownerUserId, input.ownerUserId),
        eq(idempotencyKeys.scope, scope),
        eq(idempotencyKeys.keyHash, keyHash),
      ),
    )
    .limit(1);
  if (!concurrent) {
    throw conflict("The request could not reserve its idempotency key. Try again.");
  }
  return reuseActiveReservation(
    concurrent,
    requestHash,
    ttlMs,
    database,
  );
}

async function reuseActiveReservation(
  existing: typeof idempotencyKeys.$inferSelect,
  requestHash: string,
  ttlMs: number,
  database: AppDatabase,
): Promise<IdempotencyReservation> {
  if (existing.requestHash !== requestHash) {
    throw conflict("This idempotency key was already used for another request.");
  }
  if (
    existing.status === "completed" &&
    existing.responseStatus !== null &&
    existing.responseBodyJson !== null
  ) {
    return {
      kind: "replay",
      id: existing.id,
      responseStatus: existing.responseStatus,
      responseBody: safeParseJson(existing.responseBodyJson),
    };
  }
  if (existing.status === "processing") {
    throw conflict("An identical request is already being processed.");
  }

  const restarted = await database
    .update(idempotencyKeys)
    .set({
      status: "processing",
      responseStatus: null,
      responseBodyJson: null,
      resourceType: null,
      resourceId: null,
      expiresAt: new Date(Date.now() + ttlMs),
    })
    .where(
      and(
        eq(idempotencyKeys.id, existing.id),
        eq(idempotencyKeys.status, existing.status),
      ),
    )
    .returning({ id: idempotencyKeys.id });
  if (restarted.length === 0) {
    throw conflict("An identical request is already being processed.");
  }
  return { kind: "started", id: existing.id };
}

export async function completeIdempotentRequest(
  input: {
    id: string;
    ownerUserId: string;
    responseStatus: number;
    responseBody: unknown;
    resourceType?: string;
    resourceId?: string;
  },
  database: AppDatabase = getDb(),
): Promise<void> {
  await database
    .update(idempotencyKeys)
    .set({
      status: "completed",
      responseStatus: input.responseStatus,
      responseBodyJson: JSON.stringify(input.responseBody ?? null),
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
    })
    .where(
      and(
        eq(idempotencyKeys.id, input.id),
        eq(idempotencyKeys.ownerUserId, input.ownerUserId),
        eq(idempotencyKeys.status, "processing"),
      ),
    );
}

export async function failIdempotentRequest(
  id: string,
  ownerUserId: string,
  database: AppDatabase = getDb(),
): Promise<void> {
  await database
    .update(idempotencyKeys)
    .set({ status: "failed" })
    .where(
      and(
        eq(idempotencyKeys.id, id),
        eq(idempotencyKeys.ownerUserId, ownerUserId),
        eq(idempotencyKeys.status, "processing"),
      ),
    );
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
