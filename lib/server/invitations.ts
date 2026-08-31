import "server-only";

import { and, eq, gt, ne, sql } from "drizzle-orm";

import { getDb, type AppDatabase } from "@/lib/db/client";
import { auditLogs, groupMembers, invitations } from "@/lib/db/schema";

import { HttpError } from "./errors";
import {
  getAuthSecret,
  getPrivateSignupBootstrapToken,
  getPrivateSignupEmailAllowlist,
} from "./env";
import {
  hashInvitationToken,
  isValidNormalizedEmail,
  normalizeEmail,
  secureTokenMatches,
} from "./private-signup-policy";

export type PrivateSignupAuthorization =
  | { kind: "allowlist"; email: string }
  | {
      kind: "invitation";
      email: string;
      invitationId: string;
      groupId: string;
      role: "admin" | "member";
    };

export type CreateInvitationInput = {
  groupId: string;
  inviterUserId: string;
  email: string;
  role?: "admin" | "member";
  expiresInMs?: number;
  idempotencyKey: string;
};

export type InvitationClaimResult =
  | {
      status: "claimed" | "already_claimed";
      invitationId: string;
      groupId: string;
    }
  | { status: "bootstrap_authorized" };

const DEFAULT_INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

export async function authorizePrivateSignup(
  input: { email: string; invitationToken?: string },
  database: AppDatabase = getDb(),
  now = new Date(),
): Promise<PrivateSignupAuthorization | null> {
  const email = normalizeEmail(input.email);

  if (input.invitationToken) {
    let tokenHash: string | undefined;
    try {
      tokenHash = await hashInvitationToken(input.invitationToken);
    } catch {
      // A malformed invitation may still be rejected by the bootstrap check
      // below without exposing which private access mechanism is configured.
    }

    if (tokenHash) {
      const [invitation] = await database
        .select({
          id: invitations.id,
          groupId: invitations.groupId,
          role: invitations.role,
        })
        .from(invitations)
        .where(
          and(
            eq(invitations.invitedEmail, email),
            eq(invitations.tokenHash, tokenHash),
            eq(invitations.status, "pending"),
            gt(invitations.expiresAt, now),
          ),
        )
        .limit(1);

      if (invitation) {
        return {
          kind: "invitation",
          email,
          invitationId: invitation.id,
          groupId: invitation.groupId,
          role: invitation.role,
        };
      }
    }
  }

  if (!getPrivateSignupEmailAllowlist().has(email)) return null;

  const bootstrapToken = getPrivateSignupBootstrapToken();
  if (
    !bootstrapToken ||
    !input.invitationToken ||
    !(await secureTokenMatches(input.invitationToken, bootstrapToken))
  ) {
    return null;
  }

  return { kind: "allowlist", email };
}

export async function createPrivateInvitation(
  input: CreateInvitationInput,
  database: AppDatabase = getDb(),
): Promise<{ invitationId: string; token: string; expiresAt: Date }> {
  const email = normalizeEmail(input.email);
  if (!isValidNormalizedEmail(email)) throw new Error("Invalid invitation email.");
  const lifetime = input.expiresInMs ?? DEFAULT_INVITATION_LIFETIME_MS;
  if (lifetime < 5 * 60 * 1_000 || lifetime > 30 * 24 * 60 * 60 * 1_000) {
    throw new Error("Invitation lifetime must be between 5 minutes and 30 days.");
  }

  const role = input.role ?? "member";
  const { invitationId, token } = await derivePrivateInvitationCredentials({
    groupId: input.groupId,
    inviterUserId: input.inviterUserId,
    email,
    role,
    idempotencyKey: input.idempotencyKey,
  });
  const tokenHash = await hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + lifetime);
  const auditId = await deriveInvitationHmacId(
    "invitation-audit",
    input.groupId,
    input.inviterUserId,
    email,
    input.idempotencyKey,
  );

  const [existing] = await database
    .select({ expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(eq(invitations.id, invitationId))
    .limit(1);
  if (existing) return { invitationId, token, expiresAt: existing.expiresAt };

  const now = new Date();
  await database.batch([
    database
      .update(invitations)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(invitations.groupId, input.groupId),
          eq(invitations.invitedEmail, email),
          eq(invitations.status, "pending"),
          ne(invitations.id, invitationId),
        ),
      ),
    database
      .insert(invitations)
      .values({
        id: invitationId,
        groupId: input.groupId,
        inviterUserId: input.inviterUserId,
        invitedEmail: email,
        tokenHash,
        role,
        expiresAt,
      })
      .onConflictDoNothing(),
    database
      .insert(auditLogs)
      .values({
        id: auditId,
        ownerUserId: input.inviterUserId,
        actorUserId: input.inviterUserId,
        groupId: input.groupId,
        action: "group.invitation_created",
        entityType: "invitation",
        entityId: invitationId,
        metadataJson: JSON.stringify({ email, role }),
      })
      .onConflictDoNothing(),
  ]);

  const [stored] = await database
    .select({ expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(eq(invitations.id, invitationId))
    .limit(1);
  if (!stored) throw new Error("Created invitation could not be read back.");

  return { invitationId, token, expiresAt: stored.expiresAt };
}

export async function derivePrivateInvitationCredentials(input: {
  groupId: string;
  inviterUserId: string;
  email: string;
  role?: "admin" | "member";
  idempotencyKey: string;
}): Promise<{ invitationId: string; token: string }> {
  const email = normalizeEmail(input.email);
  if (!isValidNormalizedEmail(email)) throw new Error("Invalid invitation email.");
  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new Error("Idempotency key must contain between 8 and 200 characters.");
  }
  const identity = JSON.stringify([
    input.groupId,
    input.inviterUserId,
    email,
    input.role ?? "member",
    idempotencyKey,
  ]);
  const [idDigest, tokenDigest] = await Promise.all([
    signInvitationValue("invitation-id", identity),
    signInvitationValue("invitation-token", identity),
  ]);

  return {
    invitationId: `invitation_${toHex(idDigest).slice(0, 48)}`,
    token: toBase64Url(tokenDigest),
  };
}

async function deriveInvitationHmacId(
  namespace: string,
  ...parts: readonly string[]
): Promise<string> {
  const digest = await signInvitationValue(namespace, JSON.stringify(parts));
  return `${namespace}_${toHex(digest).slice(0, 48)}`;
}

async function signInvitationValue(
  purpose: string,
  value: string,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(JSON.stringify(["fen-private-invitation-v1", purpose, value])),
  );
  return new Uint8Array(signature);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export async function claimInvitationForUser(
  userId: string,
  emailValue: string,
  invitationToken: string,
  database: AppDatabase = getDb(),
  now = new Date(),
): Promise<InvitationClaimResult> {
  const email = normalizeEmail(emailValue);
  let tokenHash: string;
  try {
    tokenHash = await hashInvitationToken(invitationToken);
  } catch {
    throw new HttpError(
      404,
      "INVITATION_NOT_FOUND",
      "Invitation not found.",
    );
  }

  const invitationIsClaimable = and(
    eq(invitations.invitedEmail, email),
    eq(invitations.tokenHash, tokenHash),
    eq(invitations.status, "pending"),
    gt(invitations.expiresAt, now),
  );
  const membershipId = crypto.randomUUID();
  const nowMs = now.getTime();

  const [, acceptedInvitations, invitationRows] = await database.batch([
    database
      .insert(groupMembers)
      .select(
        database
          .select({
            id: sql<string>`${membershipId}`.as("id"),
            groupId: invitations.groupId,
            userId: sql<string>`${userId}`.as("user_id"),
            role: invitations.role,
            status: sql<"active">`'active'`.as("status"),
            nickname: sql<string | null>`null`.as("nickname"),
            joinedAt: sql<Date>`${nowMs}`.as("joined_at"),
            leftAt: sql<Date | null>`null`.as("left_at"),
            createdAt: sql<Date>`${nowMs}`.as("created_at"),
            updatedAt: sql<Date>`${nowMs}`.as("updated_at"),
          })
          .from(invitations)
          .where(invitationIsClaimable)
          .limit(1),
      )
      .onConflictDoUpdate({
        target: [groupMembers.groupId, groupMembers.userId],
        // Reactivate an existing membership without allowing an invitation to
        // downgrade an owner/admin role that was already granted.
        set: { status: "active", leftAt: null, updatedAt: now },
      }),
    database
      .update(invitations)
      .set({
        status: "accepted",
        acceptedByUserId: userId,
        acceptedAt: now,
        updatedAt: now,
      })
      .where(invitationIsClaimable)
      .returning({
        invitationId: invitations.id,
        groupId: invitations.groupId,
        acceptedByUserId: invitations.acceptedByUserId,
      }),
    database
      .select({
        invitationId: invitations.id,
        groupId: invitations.groupId,
        invitedEmail: invitations.invitedEmail,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        acceptedByUserId: invitations.acceptedByUserId,
      })
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1),
  ]);

  const acceptedInvitation = acceptedInvitations.find(
    ({ acceptedByUserId }) => acceptedByUserId === userId,
  );
  if (acceptedInvitation) {
    return {
      status: "claimed",
      invitationId: acceptedInvitation.invitationId,
      groupId: acceptedInvitation.groupId,
    };
  }

  const invitation = invitationRows[0];
  if (!invitation) {
    const bootstrapToken = getPrivateSignupBootstrapToken();
    if (
      bootstrapToken &&
      getPrivateSignupEmailAllowlist().has(email) &&
      (await secureTokenMatches(invitationToken, bootstrapToken))
    ) {
      return { status: "bootstrap_authorized" };
    }

    throw new HttpError(
      404,
      "INVITATION_NOT_FOUND",
      "Invitation not found.",
    );
  }

  if (invitation.invitedEmail !== email) {
    throw new HttpError(
      409,
      "INVITATION_EMAIL_MISMATCH",
      "This invitation belongs to another email address.",
    );
  }

  if (invitation.status === "accepted") {
    if (invitation.acceptedByUserId === userId) {
      return {
        status: "already_claimed",
        invitationId: invitation.invitationId,
        groupId: invitation.groupId,
      };
    }

    throw new HttpError(
      409,
      "INVITATION_ALREADY_CLAIMED",
      "This invitation was already claimed by another account.",
    );
  }

  if (invitation.status === "revoked") {
    throw new HttpError(
      410,
      "INVITATION_REVOKED",
      "This invitation was revoked.",
    );
  }

  if (invitation.status === "expired" || invitation.expiresAt <= now) {
    throw new HttpError(
      410,
      "INVITATION_EXPIRED",
      "This invitation expired.",
    );
  }

  throw new HttpError(
    409,
    "INVITATION_CLAIM_CONFLICT",
    "The invitation could not be claimed. Try again.",
  );
}
