import "server-only";

import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, type AppDatabase } from "../db/client";
import {
  auditLogs,
  budgets,
  expenses,
  expenseShares,
  groupMembers,
  groups,
  settlements,
  walletTransactions,
} from "../db/schema";

import { requireGroupMembership, requireGroupOwner } from "./access";
import { conflict, forbidden, notFound } from "./errors";
import { stableStringify } from "./idempotency";
import { MAX_EXPENSE_SHARES } from "./ledger-limits";
import { stableEntityId } from "./stable-id";

export { MAX_EXPENSE_SHARES } from "./ledger-limits";

const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

const expenseInputSchema = z.object({
  groupId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(2_000).nullish(),
  category: z.string().trim().min(1).max(80).optional(),
  amountFen: z.number().int().positive().safe(),
  currency: currencySchema.optional(),
  amountBaseFen: z.number().int().positive().safe().nullish(),
  fxRateMicros: z.number().int().positive().safe().nullish(),
  occurredAt: z.date(),
  paidByMemberId: z.string().min(1),
  source: z.enum(["manual", "wechat", "alipay"]).optional(),
  receiptUrl: z.url().nullish(),
  shares: z
    .array(
      z.object({
        memberId: z.string().min(1),
        amountFen: z.number().int().nonnegative().safe(),
      }),
    )
    .min(1)
    .max(
      MAX_EXPENSE_SHARES,
      `An expense can include at most ${MAX_EXPENSE_SHARES} participants.`,
    ),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

const settlementInputSchema = z.object({
  groupId: z.string().min(1),
  fromMemberId: z.string().min(1),
  toMemberId: z.string().min(1),
  amountFen: z.number().int().positive().safe(),
  currency: currencySchema.optional(),
  amountBaseFen: z.number().int().positive().safe().nullish(),
  occurredAt: z.date(),
  note: z.string().trim().max(1_000).nullish(),
  source: z.enum(["manual", "wechat", "alipay"]).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

const budgetInputSchema = z.object({
  id: z.string().min(1).optional(),
  groupId: z.string().min(1).nullish(),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80).nullish(),
  periodType: z
    .enum(["week", "month", "term", "year", "custom"])
    .optional(),
  amountFen: z.number().int().positive().safe(),
  currency: currencySchema.optional(),
  startsAt: z.date(),
  endsAt: z.date(),
  rollover: z.boolean().optional(),
  alertThresholdBasisPoints: z.number().int().min(1).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

const personalWalletTransactionInputSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200),
  title: z.string().trim().min(1).max(160),
  amountFen: z.number().int().positive().safe(),
  currency: currencySchema.optional(),
  occurredAt: z.date(),
  direction: z.enum(["outflow", "inflow"]).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  subcategory: z.string().trim().min(1).max(80).nullish(),
  merchant: z.string().trim().min(1).max(160).nullish(),
  counterparty: z.string().trim().min(1).max(160).nullish(),
  paymentMethod: z.string().trim().min(1).max(120).nullish(),
  note: z.string().trim().max(2_000).nullish(),
});

export type CreateExpenseInput = z.input<typeof expenseInputSchema>;
export type CreateSettlementInput = z.input<typeof settlementInputSchema>;
export type UpsertBudgetInput = z.input<typeof budgetInputSchema>;
export type CreatePersonalWalletTransactionInput = z.input<
  typeof personalWalletTransactionInputSchema
>;

export async function createPersonalWalletTransaction(
  ownerUserId: string,
  inputValue: CreatePersonalWalletTransactionInput,
  database: AppDatabase = getDb(),
) {
  const input = personalWalletTransactionInputSchema.parse(inputValue);
  const normalized = {
    title: input.title,
    amountFen: input.amountFen,
    currency: input.currency ?? "CNY",
    occurredAt: input.occurredAt.toISOString(),
    direction: input.direction ?? "outflow",
    category: input.category ?? "other",
    subcategory: input.subcategory ?? null,
    merchant: input.merchant ?? null,
    counterparty: input.counterparty ?? null,
    paymentMethod: input.paymentMethod ?? null,
    note: input.note ?? null,
  };
  const fingerprint = await sha256Hex(stableStringify(normalized));
  const sourceId = await sha256Hex(
    `manual:${input.idempotencyKey}:${fingerprint}`,
  );

  const existing = await findPersonalWalletTransaction(
    ownerUserId,
    sourceId,
    database,
  );
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw conflict(
        "This idempotency key was already used for a different transaction.",
      );
    }
    return { id: existing.id, created: false as const };
  }

  const transactionId = crypto.randomUUID();
  const inserted = await database
    .insert(walletTransactions)
    .values({
      id: transactionId,
      ownerUserId,
      provider: "manual",
      sourceId,
      fingerprint,
      parserVersion: "manual-v1",
      occurredAt: input.occurredAt,
      completedAt: input.occurredAt,
      direction: normalized.direction,
      status: "completed",
      amountFen: input.amountFen,
      currency: normalized.currency,
      merchant: normalized.merchant,
      counterparty: normalized.counterparty,
      paymentMethod: normalized.paymentMethod,
      rawDescription: input.title,
      note: normalized.note,
      category: normalized.category,
      subcategory: normalized.subcategory,
    })
    .onConflictDoNothing({
      target: [
        walletTransactions.ownerUserId,
        walletTransactions.provider,
        walletTransactions.sourceId,
      ],
    })
    .returning({ id: walletTransactions.id });

  if (inserted.length === 0) {
    const concurrent = await findPersonalWalletTransaction(
      ownerUserId,
      sourceId,
      database,
    );
    if (!concurrent) {
      throw conflict("The transaction could not be persisted.");
    }
    if (concurrent.fingerprint !== fingerprint) {
      throw conflict(
        "This idempotency key was already used for a different transaction.",
      );
    }
    return { id: concurrent.id, created: false as const };
  }

  await database.insert(auditLogs).values({
    id: crypto.randomUUID(),
    ownerUserId,
    actorUserId: ownerUserId,
    action: "wallet_transaction.created",
    entityType: "wallet_transaction",
    entityId: transactionId,
    metadataJson: JSON.stringify({
      provider: "manual",
      amountFen: input.amountFen,
      currency: normalized.currency,
    }),
  });

  return { id: transactionId, created: true as const };
}

export async function createExpenseWithShares(
  actorUserId: string,
  inputValue: CreateExpenseInput,
  database: AppDatabase = getDb(),
) {
  const input = expenseInputSchema.parse(inputValue);
  await requireGroupMembership(actorUserId, input.groupId, database);

  const [groupPeriod] = await database
    .select({ startsAt: groups.startsAt, endsAt: groups.endsAt })
    .from(groups)
    .where(eq(groups.id, input.groupId))
    .limit(1);
  if (!groupPeriod) throw notFound("Group not found.");
  if (
    (groupPeriod.startsAt && input.occurredAt < groupPeriod.startsAt) ||
    (groupPeriod.endsAt && input.occurredAt > groupPeriod.endsAt)
  ) {
    throw conflict("The expense date must fall within the group period.");
  }

  const uniqueMemberIds = new Set(input.shares.map((share) => share.memberId));
  if (uniqueMemberIds.size !== input.shares.length) {
    throw conflict("An expense cannot contain duplicate member shares.");
  }

  const sharesTotal = input.shares.reduce(
    (total, share) => total + share.amountFen,
    0,
  );
  if (!Number.isSafeInteger(sharesTotal) || sharesTotal !== input.amountFen) {
    throw conflict("Expense shares must add up exactly to the expense amount.");
  }

  const referencedMemberIds = [
    ...new Set([input.paidByMemberId, ...uniqueMemberIds]),
  ];
  const activeMembers = await database
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, input.groupId),
        eq(groupMembers.status, "active"),
        inArray(groupMembers.id, referencedMemberIds),
      ),
    );

  if (activeMembers.length !== referencedMemberIds.length) {
    throw conflict("Every payer and beneficiary must be an active group member.");
  }

  const expensePayloadIdentity = stableStringify({
    groupId: input.groupId,
    title: input.title,
    notes: input.notes ?? null,
    category: input.category ?? "other",
    amountFen: input.amountFen,
    currency: input.currency ?? "CNY",
    amountBaseFen: input.amountBaseFen ?? null,
    fxRateMicros: input.fxRateMicros ?? null,
    occurredAt: input.occurredAt,
    paidByMemberId: input.paidByMemberId,
    source: input.source ?? "manual",
    receiptUrl: input.receiptUrl ?? null,
    shares: input.shares,
  });
  const expenseId = input.idempotencyKey
    ? await stableEntityId(
        "expense",
        actorUserId,
        input.groupId,
        input.idempotencyKey,
        expensePayloadIdentity,
      )
    : crypto.randomUUID();
  const shareIds = input.idempotencyKey
    ? await Promise.all(
        input.shares.map((share) =>
          stableEntityId("expense-share", expenseId, share.memberId),
        ),
      )
    : input.shares.map(() => crypto.randomUUID());
  const auditId = input.idempotencyKey
    ? await stableEntityId("audit", expenseId, "created")
    : crypto.randomUUID();
  const referencedMemberIdsJson = JSON.stringify(referencedMemberIds);
  try {
    await database.batch([
      database
        .insert(expenses)
        .select(sql`
          select
            ${expenseId},
            ${input.groupId},
            ${actorUserId},
            ${input.paidByMemberId},
            ${input.title},
            ${input.notes ?? null},
            ${input.category ?? "other"},
            ${input.amountFen},
            ${input.currency ?? "CNY"},
            ${input.amountBaseFen ?? null},
            ${input.fxRateMicros ?? null},
            ${input.occurredAt.getTime()},
            ${input.source ?? "manual"},
            ${input.receiptUrl ?? null},
            'active',
            null,
            cast(unixepoch('subsecond') * 1000 as integer),
            cast(unixepoch('subsecond') * 1000 as integer)
          where exists (
            select 1
            from group_members actor_membership
            where actor_membership.group_id = ${input.groupId}
              and actor_membership.user_id = ${actorUserId}
              and actor_membership.status = 'active'
          )
            and (
              select count(*)
              from group_members member
              where member.group_id = ${input.groupId}
                and member.status = 'active'
                and member.id in (
                  select value from json_each(${referencedMemberIdsJson})
                )
            ) = ${referencedMemberIds.length}
        `)
        .onConflictDoNothing({ target: expenses.id }),
      database
        .insert(expenseShares)
        .values(
          input.shares.map((share, index) => ({
            id: shareIds[index],
            expenseId,
            memberId: share.memberId,
            amountFen: share.amountFen,
          })),
        )
        .onConflictDoNothing(),
      database
        .insert(auditLogs)
        .select(sql`
          select
            ${auditId},
            ${actorUserId},
            ${actorUserId},
            ${input.groupId},
            'expense.created',
            'expense',
            ${expenseId},
            ${JSON.stringify({
              amountFen: input.amountFen,
              currency: input.currency ?? "CNY",
            })},
            null,
            null,
            cast(unixepoch('subsecond') * 1000 as integer)
          from expenses
          where id = ${expenseId}
        `)
        .onConflictDoNothing({ target: auditLogs.id }),
    ]);
  } catch (error) {
    if (isDatabaseConstraintError(error)) {
      throw conflict(
        "Every payer and beneficiary must still be an active group member.",
      );
    }
    throw error;
  }

  return { id: expenseId };
}

export async function createSettlement(
  actorUserId: string,
  inputValue: CreateSettlementInput,
  database: AppDatabase = getDb(),
) {
  const input = settlementInputSchema.parse(inputValue);
  await requireGroupMembership(actorUserId, input.groupId, database);
  if (input.fromMemberId === input.toMemberId) {
    throw conflict("A settlement requires two different members.");
  }

  const settlementPayloadIdentity = stableStringify({
    groupId: input.groupId,
    fromMemberId: input.fromMemberId,
    toMemberId: input.toMemberId,
    amountFen: input.amountFen,
    currency: input.currency ?? "CNY",
    amountBaseFen: input.amountBaseFen ?? null,
    occurredAt: input.occurredAt,
    note: input.note ?? null,
    source: input.source ?? "manual",
  });
  const settlementId = input.idempotencyKey
    ? await stableEntityId(
        "settlement",
        actorUserId,
        input.groupId,
        input.idempotencyKey,
        settlementPayloadIdentity,
      )
    : crypto.randomUUID();
  const auditId = input.idempotencyKey
    ? await stableEntityId("audit", settlementId, "created")
    : crypto.randomUUID();
  const currency = input.currency ?? "CNY";
  const source = input.source ?? "manual";
  const metadataJson = JSON.stringify({ amountFen: input.amountFen, currency });

  const [insertedSettlements] = await database.batch([
    database
      .insert(settlements)
      .select(sql`
        with request (
          id,
          group_id,
          actor_user_id,
          from_member_id,
          to_member_id,
          amount_fen,
          currency,
          amount_base_fen,
          occurred_at,
          note,
          source
        ) as (
          values (
            ${settlementId},
            ${input.groupId},
            ${actorUserId},
            ${input.fromMemberId},
            ${input.toMemberId},
            ${input.amountFen},
            ${currency},
            ${input.amountBaseFen ?? null},
            ${input.occurredAt.getTime()},
            ${input.note ?? null},
            ${source}
          )
        ),
        member_balances as (
          select
            member.id as member_id,
            coalesce((
              select sum(expense.amount_fen)
              from expenses expense
              where expense.group_id = request.group_id
                and expense.paid_by_member_id = member.id
                and expense.status = 'active'
                and expense.deleted_at is null
            ), 0)
            - coalesce((
              select sum(share.amount_fen)
              from expense_shares share
              inner join expenses expense on expense.id = share.expense_id
              where expense.group_id = request.group_id
                and share.member_id = member.id
                and expense.status = 'active'
                and expense.deleted_at is null
            ), 0)
            + coalesce((
              select sum(settlement.amount_fen)
              from settlements settlement
              where settlement.group_id = request.group_id
                and settlement.from_member_id = member.id
                and settlement.status = 'active'
                and settlement.deleted_at is null
            ), 0)
            - coalesce((
              select sum(settlement.amount_fen)
              from settlements settlement
              where settlement.group_id = request.group_id
                and settlement.to_member_id = member.id
                and settlement.status = 'active'
                and settlement.deleted_at is null
            ), 0) as balance_fen
          from group_members member
          cross join request
          where member.group_id = request.group_id
            and member.status = 'active'
            and member.id in (request.from_member_id, request.to_member_id)
        )
        select
          request.id,
          request.group_id,
          request.actor_user_id,
          request.from_member_id,
          request.to_member_id,
          request.amount_fen,
          request.currency,
          request.amount_base_fen,
          request.occurred_at,
          request.note,
          request.source,
          'active',
          null,
          cast(unixepoch('subsecond') * 1000 as integer),
          cast(unixepoch('subsecond') * 1000 as integer)
        from request
        inner join member_balances debtor
          on debtor.member_id = request.from_member_id
        inner join member_balances creditor
          on creditor.member_id = request.to_member_id
        where exists (
          select 1
          from group_members actor_membership
          where actor_membership.group_id = request.group_id
            and actor_membership.user_id = request.actor_user_id
            and actor_membership.status = 'active'
        )
          and debtor.balance_fen < 0
          and creditor.balance_fen > 0
          and request.amount_fen <= -debtor.balance_fen
          and request.amount_fen <= creditor.balance_fen
      `)
      .onConflictDoNothing({ target: settlements.id })
      .returning({ id: settlements.id }),
    database
      .insert(auditLogs)
      .select(sql`
        select
          ${auditId},
          ${actorUserId},
          ${actorUserId},
          ${input.groupId},
          'settlement.created',
          'settlement',
          ${settlementId},
          ${metadataJson},
          null,
          null,
          cast(unixepoch('subsecond') * 1000 as integer)
        from settlements
        where id = ${settlementId}
      `)
      .onConflictDoNothing({ target: auditLogs.id }),
  ]);

  if (insertedSettlements.length !== 1) {
    throw conflict(
      "The settlement exceeds the current balance or its direction is no longer valid.",
    );
  }

  return { id: settlementId };
}

export async function voidExpense(
  actorUserId: string,
  expenseId: string,
  database: AppDatabase = getDb(),
) {
  const [expense] = await database
    .select({
      id: expenses.id,
      groupId: expenses.groupId,
      createdByUserId: expenses.createdByUserId,
    })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.status, "active")))
    .limit(1);
  if (!expense) throw notFound("Expense not found.");

  const membership = await requireGroupMembership(
    actorUserId,
    expense.groupId,
    database,
  );
  if (
    expense.createdByUserId !== actorUserId &&
    membership.role !== "owner" &&
    membership.role !== "admin"
  ) {
    throw forbidden();
  }

  const now = new Date();
  await database.batch([
    database
      .update(expenses)
      .set({ status: "void", deletedAt: now })
      .where(eq(expenses.id, expenseId)),
    database.insert(auditLogs).values({
      id: crypto.randomUUID(),
      ownerUserId: actorUserId,
      actorUserId,
      groupId: expense.groupId,
      action: "expense.voided",
      entityType: "expense",
      entityId: expenseId,
    }),
  ]);

  return { id: expenseId, status: "void" as const };
}

export async function voidSettlement(
  actorUserId: string,
  settlementId: string,
  database: AppDatabase = getDb(),
) {
  const [settlement] = await database
    .select({
      id: settlements.id,
      groupId: settlements.groupId,
      createdByUserId: settlements.createdByUserId,
    })
    .from(settlements)
    .where(
      and(eq(settlements.id, settlementId), eq(settlements.status, "active")),
    )
    .limit(1);
  if (!settlement) throw notFound("Settlement not found.");

  const membership = await requireGroupMembership(
    actorUserId,
    settlement.groupId,
    database,
  );
  if (
    settlement.createdByUserId !== actorUserId &&
    membership.role !== "owner" &&
    membership.role !== "admin"
  ) {
    throw forbidden();
  }

  const now = new Date();
  await database.batch([
    database
      .update(settlements)
      .set({ status: "void", deletedAt: now })
      .where(eq(settlements.id, settlementId)),
    database.insert(auditLogs).values({
      id: crypto.randomUUID(),
      ownerUserId: actorUserId,
      actorUserId,
      groupId: settlement.groupId,
      action: "settlement.voided",
      entityType: "settlement",
      entityId: settlementId,
    }),
  ]);

  return { id: settlementId, status: "void" as const };
}

export async function upsertBudget(
  ownerUserId: string,
  inputValue: UpsertBudgetInput,
  database: AppDatabase = getDb(),
) {
  const input = budgetInputSchema.parse(inputValue);
  if (input.endsAt < input.startsAt) {
    throw conflict("The budget end date must be after its start date.");
  }
  if (input.groupId) {
    await requireGroupOwner(ownerUserId, input.groupId, database);
  }

  let budgetId = input.id;
  let isUpdate = false;
  if (input.id) {
    const [existing] = await database
      .select({
        ownerUserId: budgets.ownerUserId,
        groupId: budgets.groupId,
      })
      .from(budgets)
      .where(eq(budgets.id, input.id))
      .limit(1);
    if (!existing) throw notFound("Budget not found.");
    if (existing.ownerUserId !== ownerUserId) throw forbidden();
    if (existing.groupId !== (input.groupId ?? null)) {
      throw conflict("A budget cannot be moved between personal and group scopes.");
    }
    isUpdate = true;
  } else if (input.groupId) {
    const [matchingGroupBudget] = await database
      .select({ id: budgets.id })
      .from(budgets)
      .where(eq(budgets.groupId, input.groupId))
      .orderBy(desc(budgets.isActive), desc(budgets.updatedAt), budgets.id)
      .limit(1);
    budgetId =
      matchingGroupBudget?.id ??
      (await stableEntityId("group-budget", input.groupId));
    isUpdate = Boolean(matchingGroupBudget);
  } else {
    const [matchingBudget] = await database
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(
          eq(budgets.ownerUserId, ownerUserId),
          input.groupId
            ? eq(budgets.groupId, input.groupId)
            : isNull(budgets.groupId),
          eq(budgets.name, input.name),
          input.category
            ? eq(budgets.category, input.category)
            : isNull(budgets.category),
          eq(budgets.periodType, input.periodType ?? "month"),
          eq(budgets.isActive, true),
          lte(budgets.startsAt, input.endsAt),
          gte(budgets.endsAt, input.startsAt),
        ),
      )
      .orderBy(desc(budgets.updatedAt))
      .limit(1);
    if (matchingBudget) {
      budgetId = matchingBudget.id;
      isUpdate = true;
    }
  }
  budgetId ??= crypto.randomUUID();

  await database.batch([
    database
      .insert(budgets)
      .values({
        id: budgetId,
        ownerUserId,
        groupId: input.groupId ?? null,
        name: input.name,
        category: input.category ?? null,
        periodType: input.periodType,
        amountFen: input.amountFen,
        currency: input.currency,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        rollover: input.rollover,
        alertThresholdBasisPoints: input.alertThresholdBasisPoints,
        isActive: input.isActive,
      })
      .onConflictDoUpdate({
        target: budgets.id,
        set: {
          groupId: input.groupId ?? null,
          name: input.name,
          category: input.category ?? null,
          periodType: input.periodType ?? "month",
          amountFen: input.amountFen,
          currency: input.currency ?? "CNY",
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          rollover: input.rollover ?? false,
          alertThresholdBasisPoints:
            input.alertThresholdBasisPoints ?? 8_000,
          isActive: input.isActive ?? true,
        },
      }),
    database.insert(auditLogs).values({
      id: crypto.randomUUID(),
      ownerUserId,
      actorUserId: ownerUserId,
      groupId: input.groupId ?? null,
      action: isUpdate ? "budget.updated" : "budget.created",
      entityType: "budget",
      entityId: budgetId,
    }),
  ]);

  const [budget] = await database
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, budgetId), eq(budgets.ownerUserId, ownerUserId)))
    .limit(1);
  if (!budget) throw new Error("Saved budget could not be read back.");
  return budget;
}

export async function deactivateBudget(
  ownerUserId: string,
  budgetId: string,
  database: AppDatabase = getDb(),
) {
  const [existing] = await database
    .select({ id: budgets.id, groupId: budgets.groupId })
    .from(budgets)
    .where(and(eq(budgets.id, budgetId), eq(budgets.ownerUserId, ownerUserId)))
    .limit(1);
  if (!existing) throw notFound("Budget not found.");
  if (existing.groupId) {
    await requireGroupOwner(ownerUserId, existing.groupId, database);
  }

  await database
    .update(budgets)
    .set({ isActive: false })
    .where(and(eq(budgets.id, budgetId), eq(budgets.ownerUserId, ownerUserId)));

  return { id: budgetId, isActive: false as const };
}

async function findPersonalWalletTransaction(
  ownerUserId: string,
  sourceId: string,
  database: AppDatabase,
) {
  const [transaction] = await database
    .select({
      id: walletTransactions.id,
      fingerprint: walletTransactions.fingerprint,
    })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.ownerUserId, ownerUserId),
        eq(walletTransactions.provider, "manual"),
        eq(walletTransactions.sourceId, sourceId),
      ),
    )
    .limit(1);

  return transaction;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function isDatabaseConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /constraint|foreign key/iu.test(message);
}
