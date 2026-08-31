import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb, type AppDatabase } from "@/lib/db/client";
import { groupMembers, groups } from "@/lib/db/schema";

import { forbidden, notFound } from "./errors";

export type GroupRole = "owner" | "admin" | "member";

export async function requireGroupMembership(
  userId: string,
  groupId: string,
  database: AppDatabase = getDb(),
) {
  const [membership] = await database
    .select({
      id: groupMembers.id,
      groupId: groupMembers.groupId,
      userId: groupMembers.userId,
      role: groupMembers.role,
      status: groupMembers.status,
    })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "active"),
      ),
    )
    .limit(1);

  if (!membership) throw forbidden();
  return membership;
}

export async function requireGroupRole(
  userId: string,
  groupId: string,
  allowedRoles: readonly GroupRole[],
  database: AppDatabase = getDb(),
) {
  const membership = await requireGroupMembership(userId, groupId, database);
  if (!allowedRoles.includes(membership.role)) throw forbidden();
  return membership;
}

export async function requireGroupOwner(
  userId: string,
  groupId: string,
  database: AppDatabase = getDb(),
) {
  const [group] = await database
    .select({ id: groups.id, ownerUserId: groups.ownerUserId })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw notFound("Group not found.");
  if (group.ownerUserId !== userId) throw forbidden();
  return group;
}
