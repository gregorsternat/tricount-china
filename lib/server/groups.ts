import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, type AppDatabase } from "@/lib/db/client";
import {
  auditLogs,
  groupMembers,
  groups,
  users,
} from "@/lib/db/schema";

import { requireGroupOwner, requireGroupRole } from "./access";
import { conflict, forbidden, notFound } from "./errors";
import { stableStringify } from "./idempotency";
import { createPrivateInvitation } from "./invitations";
import { normalizeEmail } from "./private-signup-policy";
import { stableEntityId } from "./stable-id";

const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

const createGroupSchema = z.object({
  ownerUserId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1_000).nullish(),
  emoji: z.string().trim().min(1).max(16).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/iu).optional(),
  baseCurrency: currencySchema.optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  academicYearLabel: z.string().trim().max(40).nullish(),
  startsAt: z.date().nullish(),
  endsAt: z.date().nullish(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

const updateGroupSchema = createGroupSchema
  .omit({ ownerUserId: true, idempotencyKey: true })
  .partial()
  .refine((input) => Object.keys(input).length > 0, "No fields to update.");

const memberRoleSchema = z.enum(["admin", "member"]);

export type CreateGroupInput = z.input<typeof createGroupSchema>;
export type UpdateGroupInput = z.input<typeof updateGroupSchema>;

export async function createGroup(
  inputValue: CreateGroupInput,
  database: AppDatabase = getDb(),
) {
  const input = createGroupSchema.parse(inputValue);
  if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) {
    throw new z.ZodError([
      {
        code: "custom",
        message: "The group end date must be after its start date.",
        path: ["endsAt"],
      },
    ]);
  }

  const groupPayloadIdentity = stableStringify({
    ownerUserId: input.ownerUserId,
    name: input.name,
    description: input.description ?? null,
    emoji: input.emoji ?? "🧾",
    color: input.color ?? "#F97316",
    baseCurrency: input.baseCurrency ?? "CNY",
    timezone: input.timezone ?? "Asia/Shanghai",
    academicYearLabel: input.academicYearLabel ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
  });
  const groupId = input.idempotencyKey
    ? await stableEntityId(
        "group",
        input.ownerUserId,
        input.idempotencyKey,
        groupPayloadIdentity,
      )
    : crypto.randomUUID();
  const membershipId = input.idempotencyKey
    ? await stableEntityId("membership", groupId, input.ownerUserId)
    : crypto.randomUUID();
  const auditId = input.idempotencyKey
    ? await stableEntityId("audit", groupId, "created")
    : crypto.randomUUID();
  const now = new Date();

  await database.batch([
    database
      .insert(groups)
      .values({
        id: groupId,
        ownerUserId: input.ownerUserId,
        name: input.name,
        description: input.description ?? null,
        emoji: input.emoji,
        color: input.color,
        baseCurrency: input.baseCurrency,
        timezone: input.timezone,
        academicYearLabel: input.academicYearLabel ?? null,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
      })
      .onConflictDoNothing(),
    database
      .insert(groupMembers)
      .values({
        id: membershipId,
        groupId,
        userId: input.ownerUserId,
        role: "owner",
        joinedAt: now,
      })
      .onConflictDoNothing(),
    database
      .insert(auditLogs)
      .values({
        id: auditId,
        ownerUserId: input.ownerUserId,
        actorUserId: input.ownerUserId,
        groupId,
        action: "group.created",
        entityType: "group",
        entityId: groupId,
      })
      .onConflictDoNothing(),
  ]);

  const [group] = await database
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new Error("Created group could not be read back.");
  return group;
}

export async function updateGroup(
  actorUserId: string,
  groupId: string,
  inputValue: UpdateGroupInput,
  database: AppDatabase = getDb(),
) {
  await requireGroupRole(actorUserId, groupId, ["owner", "admin"], database);
  const input = updateGroupSchema.parse(inputValue);

  const [current] = await database
    .select({ startsAt: groups.startsAt, endsAt: groups.endsAt })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!current) throw notFound("Group not found.");

  const startsAt = input.startsAt === undefined ? current.startsAt : input.startsAt;
  const endsAt = input.endsAt === undefined ? current.endsAt : input.endsAt;
  if (startsAt && endsAt && endsAt < startsAt) {
    throw conflict("The group end date must be after its start date.");
  }

  await database.batch([
    database
      .update(groups)
      .set({
        ...input,
        description:
          input.description === undefined ? undefined : (input.description ?? null),
        academicYearLabel:
          input.academicYearLabel === undefined
            ? undefined
            : (input.academicYearLabel ?? null),
        startsAt: input.startsAt === undefined ? undefined : (input.startsAt ?? null),
        endsAt: input.endsAt === undefined ? undefined : (input.endsAt ?? null),
      })
      .where(eq(groups.id, groupId)),
    database.insert(auditLogs).values({
      id: crypto.randomUUID(),
      ownerUserId: actorUserId,
      actorUserId,
      groupId,
      action: "group.updated",
      entityType: "group",
      entityId: groupId,
      metadataJson: JSON.stringify({ fields: Object.keys(input) }),
    }),
  ]);

  const [group] = await database
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!group) throw notFound("Group not found.");
  return group;
}

export async function archiveGroup(
  actorUserId: string,
  groupId: string,
  archived = true,
  database: AppDatabase = getDb(),
) {
  await requireGroupOwner(actorUserId, groupId, database);

  await database.batch([
    database
      .update(groups)
      .set({ isArchived: archived })
      .where(eq(groups.id, groupId)),
    database.insert(auditLogs).values({
      id: crypto.randomUUID(),
      ownerUserId: actorUserId,
      actorUserId,
      groupId,
      action: archived ? "group.archived" : "group.restored",
      entityType: "group",
      entityId: groupId,
    }),
  ]);

  return { id: groupId, isArchived: archived };
}

export async function addExistingGroupMember(
  actorUserId: string,
  groupId: string,
  targetUserId: string,
  roleValue: "admin" | "member" = "member",
  database: AppDatabase = getDb(),
) {
  const actor = await requireGroupRole(
    actorUserId,
    groupId,
    ["owner", "admin"],
    database,
  );
  const role = memberRoleSchema.parse(roleValue);
  if (role === "admin" && actor.role !== "owner") throw forbidden();

  const [target] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) throw notFound("User not found.");

  const [existing] = await database
    .select({
      id: groupMembers.id,
      role: groupMembers.role,
      status: groupMembers.status,
    })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, targetUserId),
      ),
    )
    .limit(1);

  if (existing?.status === "active") {
    return { id: existing.id, userId: targetUserId, role: existing.role };
  }
  if (existing?.role === "owner") {
    return { id: existing.id, userId: targetUserId, role: "owner" as const };
  }

  const membershipId = existing?.id ?? crypto.randomUUID();
  const membershipRole = existing?.role ?? role;
  await database.batch([
    database
      .insert(groupMembers)
      .values({
        id: membershipId,
        groupId,
        userId: targetUserId,
        role: membershipRole,
      })
      .onConflictDoUpdate({
        target: [groupMembers.groupId, groupMembers.userId],
        set: { role: membershipRole, status: "active", leftAt: null },
      }),
    database.insert(auditLogs).values({
      id: crypto.randomUUID(),
      ownerUserId: actorUserId,
      actorUserId,
      groupId,
      action: "group.member_added",
      entityType: "group_member",
      entityId: membershipId,
      metadataJson: JSON.stringify({ targetUserId, role: membershipRole }),
    }),
  ]);

  return { id: membershipId, userId: targetUserId, role: membershipRole };
}

export async function inviteGroupMember(
  actorUserId: string,
  groupId: string,
  inputValue: {
    email: string;
    role?: "admin" | "member";
    expiresInMs?: number;
    idempotencyKey: string;
  },
  database: AppDatabase = getDb(),
) {
  const actor = await requireGroupRole(
    actorUserId,
    groupId,
    ["owner", "admin"],
    database,
  );
  const email = z.email().parse(normalizeEmail(inputValue.email));
  const role = memberRoleSchema.parse(inputValue.role ?? "member");
  if (role === "admin" && actor.role !== "owner") throw forbidden();

  const [existingUser] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    const membership = await addExistingGroupMember(
      actorUserId,
      groupId,
      existingUser.id,
      role,
      database,
    );
    return { kind: "existing-user" as const, membership };
  }

  const invitation = await createPrivateInvitation(
    {
      groupId,
      inviterUserId: actorUserId,
      email,
      role,
      expiresInMs: inputValue.expiresInMs,
      idempotencyKey: inputValue.idempotencyKey,
    },
    database,
  );

  return { kind: "invitation" as const, ...invitation, email, role };
}

export async function removeGroupMember(
  actorUserId: string,
  groupId: string,
  targetUserId: string,
  database: AppDatabase = getDb(),
) {
  const actor = await requireGroupRole(
    actorUserId,
    groupId,
    ["owner", "admin"],
    database,
  );
  const [target] = await database
    .select({ id: groupMembers.id, role: groupMembers.role })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, targetUserId),
        eq(groupMembers.status, "active"),
      ),
    )
    .limit(1);

  if (!target) throw notFound("Group member not found.");
  if (target.role === "owner") throw conflict("The group owner cannot be removed.");
  if (target.role === "admin" && actor.role !== "owner") throw forbidden();

  const now = new Date();
  const auditId = await stableEntityId(
    "audit",
    target.id,
    "removed",
    String(now.getTime()),
  );
  const [removedMembers] = await database.batch([
    database
      .update(groupMembers)
      .set({ status: "left", leftAt: now })
      .where(
        and(
          eq(groupMembers.id, target.id),
          eq(groupMembers.status, "active"),
          sql`(
            coalesce((
              select sum(expense.amount_fen)
              from expenses expense
              where expense.group_id = ${groupId}
                and expense.paid_by_member_id = ${target.id}
                and expense.status = 'active'
                and expense.deleted_at is null
            ), 0)
            - coalesce((
              select sum(share.amount_fen)
              from expense_shares share
              inner join expenses expense on expense.id = share.expense_id
              where expense.group_id = ${groupId}
                and share.member_id = ${target.id}
                and expense.status = 'active'
                and expense.deleted_at is null
            ), 0)
            + coalesce((
              select sum(settlement.amount_fen)
              from settlements settlement
              where settlement.group_id = ${groupId}
                and settlement.from_member_id = ${target.id}
                and settlement.status = 'active'
                and settlement.deleted_at is null
            ), 0)
            - coalesce((
              select sum(settlement.amount_fen)
              from settlements settlement
              where settlement.group_id = ${groupId}
                and settlement.to_member_id = ${target.id}
                and settlement.status = 'active'
                and settlement.deleted_at is null
            ), 0)
          ) = 0`,
        ),
      )
      .returning({ id: groupMembers.id }),
    database
      .insert(auditLogs)
      .select(sql`
        select
          ${auditId},
          ${actorUserId},
          ${actorUserId},
          ${groupId},
          'group.member_removed',
          'group_member',
          ${target.id},
          ${JSON.stringify({ targetUserId })},
          null,
          null,
          cast(unixepoch('subsecond') * 1000 as integer)
        from group_members
        where id = ${target.id}
          and status = 'left'
          and left_at = ${now.getTime()}
      `)
      .onConflictDoNothing({ target: auditLogs.id }),
  ]);

  if (removedMembers.length !== 1) {
    throw conflict(
      "Settle this member's balance before removing them from the group.",
    );
  }

  return { id: target.id, status: "left" as const };
}
