import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { getDb, type AppDatabase } from "@/lib/db/client";
import {
  auditLogs,
  expenses,
  expenseShares,
  groupMembers,
  groups,
  walletExpenseLinks,
  walletTransactions,
} from "@/lib/db/schema";

import { requireGroupMembership } from "./access";
import { conflict, notFound } from "./errors";
import { MAX_EXPENSE_SHARES } from "./ledger-limits";
import { stableEntityId } from "./stable-id";

export async function shareWalletTransactionWithGroup(
  ownerUserId: string,
  walletTransactionId: string,
  groupId: string,
  database: AppDatabase = getDb(),
) {
  const membership = await requireGroupMembership(ownerUserId, groupId, database);
  const [transaction] = await database
    .select()
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.id, walletTransactionId),
        eq(walletTransactions.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);
  if (!transaction) throw notFound("Wallet transaction not found.");

  const [groupPeriod] = await database
    .select({ startsAt: groups.startsAt, endsAt: groups.endsAt })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!groupPeriod) throw notFound("Group not found.");
  if (
    (groupPeriod.startsAt && transaction.occurredAt < groupPeriod.startsAt) ||
    (groupPeriod.endsAt && transaction.occurredAt > groupPeriod.endsAt)
  ) {
    throw conflict("The payment date falls outside the group period.");
  }

  const existingLink = await findWalletExpenseLink(
    ownerUserId,
    walletTransactionId,
    database,
  );
  if (existingLink) {
    if (existingLink.groupId !== groupId) {
      throw conflict("This wallet payment is already shared with another group.");
    }
    return { expenseId: existingLink.expenseId, replayed: true as const };
  }

  const effectiveAmountFen = Math.max(
    0,
    transaction.amountFen - (transaction.refundAmountFen ?? 0),
  );
  const shareableStatuses = new Set(["completed", "partially_refunded"]);
  if (
    transaction.direction !== "outflow" ||
    !shareableStatuses.has(transaction.status) ||
    effectiveAmountFen <= 0
  ) {
    throw conflict("Only completed outgoing payments can be shared as expenses.");
  }

  const activeMembers = await database
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.status, "active"),
      ),
    );
  if (!activeMembers.length) throw conflict("The group has no active members.");
  if (activeMembers.length > MAX_EXPENSE_SHARES) {
    throw conflict(
      `A wallet payment can be shared with at most ${MAX_EXPENSE_SHARES} active members.`,
    );
  }

  const baseShareFen = Math.floor(effectiveAmountFen / activeMembers.length);
  const remainderFen = effectiveAmountFen % activeMembers.length;
  const expenseId = await stableEntityId(
    "wallet-expense",
    ownerUserId,
    walletTransactionId,
    groupId,
  );
  const linkId = await stableEntityId(
    "wallet-expense-link",
    ownerUserId,
    walletTransactionId,
  );
  const shareIds = await Promise.all(
    activeMembers.map((member) =>
      stableEntityId("wallet-expense-share", expenseId, member.id),
    ),
  );
  const auditId = await stableEntityId("audit", linkId, "created");
  const activeMemberIdsJson = JSON.stringify(
    activeMembers.map((member) => member.id),
  );
  const title =
    transaction.merchant ||
    transaction.counterparty ||
    transaction.rawDescription ||
    "Paiement importé";

  try {
    await database.batch([
      database
        .insert(expenses)
        .select(sql`
          select
            ${expenseId},
            ${groupId},
            ${ownerUserId},
            ${membership.id},
            ${title},
            ${`Partagé depuis ${transaction.provider === "wechat" ? "WeChat Pay" : transaction.provider === "alipay" ? "Alipay" : "le portefeuille personnel"}`},
            ${transaction.category || "other"},
            ${effectiveAmountFen},
            ${transaction.currency},
            null,
            null,
            ${transaction.occurredAt.getTime()},
            ${transaction.provider},
            null,
            'active',
            null,
            cast(unixepoch('subsecond') * 1000 as integer),
            cast(unixepoch('subsecond') * 1000 as integer)
          where exists (
            select 1
            from group_members payer
            where payer.id = ${membership.id}
              and payer.group_id = ${groupId}
              and payer.user_id = ${ownerUserId}
              and payer.status = 'active'
          )
            and exists (
              select 1
              from wallet_transactions current_wallet
              where current_wallet.id = ${walletTransactionId}
                and current_wallet.owner_user_id = ${ownerUserId}
                and current_wallet.direction = 'outflow'
                and current_wallet.status in ('completed', 'partially_refunded')
                and current_wallet.amount_fen
                  - coalesce(current_wallet.refund_amount_fen, 0)
                  = ${effectiveAmountFen}
            )
            and (
              select count(*)
              from group_members member
              where member.group_id = ${groupId}
                and member.status = 'active'
                and member.id in (
                  select value from json_each(${activeMemberIdsJson})
                )
            ) = ${activeMembers.length}
            and (
              select count(*)
              from group_members member
              where member.group_id = ${groupId}
                and member.status = 'active'
            ) = ${activeMembers.length}
        `),
      database.insert(expenseShares).values(
        activeMembers.map((member, index) => ({
          id: shareIds[index],
          expenseId,
          memberId: member.id,
          amountFen: baseShareFen + (index < remainderFen ? 1 : 0),
        })),
      ),
      database.insert(walletExpenseLinks).values({
        id: linkId,
        ownerUserId,
        walletTransactionId,
        expenseId,
        matchType: "manual",
        confidenceBasisPoints: 10_000,
      }),
      database.insert(auditLogs).values({
        id: auditId,
        ownerUserId,
        actorUserId: ownerUserId,
        groupId,
        action: "wallet_transaction.shared",
        entityType: "wallet_expense_link",
        entityId: linkId,
        metadataJson: JSON.stringify({ walletTransactionId, expenseId }),
      }),
    ]);
  } catch (error) {
    // D1 batches are atomic. First resolve a unique-key race as a replay;
    // otherwise surface a concurrent wallet/member state change as a conflict.
    const concurrentLink = await findWalletExpenseLink(
      ownerUserId,
      walletTransactionId,
      database,
    );
    if (!concurrentLink) {
      if (isDatabaseConstraintError(error)) {
        throw conflict(
          "The wallet payment or group membership changed while sharing. Try again.",
        );
      }
      throw error;
    }
    if (concurrentLink.groupId !== groupId) {
      throw conflict("This wallet payment is already shared with another group.");
    }
    return { expenseId: concurrentLink.expenseId, replayed: true as const };
  }

  return { expenseId, replayed: false as const };
}

async function findWalletExpenseLink(
  ownerUserId: string,
  walletTransactionId: string,
  database: AppDatabase,
): Promise<{ expenseId: string; groupId: string } | undefined> {
  const [link] = await database
    .select({ expenseId: walletExpenseLinks.expenseId, groupId: expenses.groupId })
    .from(walletExpenseLinks)
    .innerJoin(expenses, eq(expenses.id, walletExpenseLinks.expenseId))
    .where(
      and(
        eq(walletExpenseLinks.ownerUserId, ownerUserId),
        eq(walletExpenseLinks.walletTransactionId, walletTransactionId),
      ),
    )
    .limit(1);
  return link;
}

function isDatabaseConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /constraint|foreign key/iu.test(message);
}
