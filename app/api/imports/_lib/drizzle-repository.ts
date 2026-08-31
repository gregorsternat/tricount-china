import "server-only";

import { and, desc, eq, lte, ne, or, sql } from "drizzle-orm";

import type { AppDatabase } from "../../../../lib/db/client";
import { importBatches, walletTransactions } from "../../../../lib/db/schema";
import {
  WALLET_IMPORT_PARSER_VERSION,
  type WalletTransaction,
  type WalletTransactionKind,
} from "../../../../lib/import";

import type {
  ImportBatchRecord,
  ImportHistoryItem,
  ImportRepository,
  PersistedWalletTransaction,
  SavePreviewInput,
  StagedAction,
  StagedPreview,
} from "./contracts";

const MAX_D1_JSON_BINDING_BYTES = 1_500_000;
const WALLET_KINDS = new Set<WalletTransactionKind>([
  "payment",
  "transfer",
  "refund",
  "top_up",
  "withdrawal",
  "other",
]);

function normalizedKind(value: string | null): WalletTransactionKind {
  return value && WALLET_KINDS.has(value as WalletTransactionKind)
    ? (value as WalletTransactionKind)
    : "other";
}

function formatChinaDate(value: Date): string {
  const china = new Date(value.getTime() + 8 * 60 * 60 * 1_000);
  return `${china.getUTCFullYear()}-${String(china.getUTCMonth() + 1).padStart(2, "0")}-${String(china.getUTCDate()).padStart(2, "0")}T${String(china.getUTCHours()).padStart(2, "0")}:${String(china.getUTCMinutes()).padStart(2, "0")}:${String(china.getUTCSeconds()).padStart(2, "0")}+08:00`;
}

function toPersistedWalletTransaction(
  row: Pick<
    typeof walletTransactions.$inferSelect,
    | "id"
    | "provider"
    | "sourceId"
    | "externalTransactionId"
    | "merchantOrderId"
    | "fingerprint"
    | "occurredAt"
    | "direction"
    | "status"
    | "kind"
    | "amountFen"
    | "isRefund"
    | "refundAmountFen"
    | "relatedTransactionId"
    | "merchant"
    | "counterparty"
    | "rawDescription"
    | "categoryRaw"
    | "paymentMethod"
    | "note"
  >,
): PersistedWalletTransaction {
  if (row.provider === "manual") {
    throw new Error("Manual transactions cannot be reconciled as wallet imports.");
  }

  return {
    id: row.id,
    transaction: {
      source: row.provider,
      sourceId: row.sourceId,
      externalTransactionId: row.externalTransactionId ?? undefined,
      merchantOrderId: row.merchantOrderId ?? undefined,
      fingerprint: row.fingerprint,
      parserVersion: WALLET_IMPORT_PARSER_VERSION,
      occurredAt: formatChinaDate(row.occurredAt),
      timezone: "Asia/Shanghai",
      amountFen: row.amountFen,
      currency: "CNY",
      direction: row.direction,
      status: row.status,
      kind: normalizedKind(row.kind),
      isRefund: row.isRefund,
      refundAmountFen: row.refundAmountFen ?? undefined,
      relatedTransactionId: row.relatedTransactionId ?? undefined,
      counterparty: row.counterparty ?? row.merchant ?? undefined,
      description: row.rawDescription ?? undefined,
      categoryRaw: row.categoryRaw ?? undefined,
      paymentMethod: row.paymentMethod ?? undefined,
      note: row.note ?? undefined,
      // Raw provider payloads are deliberately excluded from the merge scan:
      // status/refund reconciliation only needs normalized fields and loading
      // every raw statement row can exceed a Worker's memory budget.
      rawData: {},
    },
  };
}

function toBatchRecord(
  row: typeof importBatches.$inferSelect,
): ImportBatchRecord {
  return { ...row, totalFen: parseStoredSummary(row.errorsJson).totalFen };
}

function parseStoredSummary(value: string | null): { readonly totalFen: number } {
  if (!value) return { totalFen: 0 };
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "summary" in parsed &&
      parsed.summary &&
      typeof parsed.summary === "object" &&
      "totalFen" in parsed.summary &&
      typeof parsed.summary.totalFen === "number" &&
      Number.isSafeInteger(parsed.summary.totalFen) &&
      parsed.summary.totalFen >= 0
    ) {
      return { totalFen: parsed.summary.totalFen };
    }
  } catch {
    // Older batches stored a plain issue array and therefore have no total.
  }
  return { totalFen: 0 };
}

interface DatabaseTransactionPayload {
  readonly id: string;
  readonly ownerUserId: string;
  readonly importBatchId: string;
  readonly provider: string;
  readonly sourceId: string;
  readonly externalTransactionId: string | null;
  readonly merchantOrderId: string | null;
  readonly fingerprint: string;
  readonly parserVersion: string;
  readonly occurredAt: number;
  readonly direction: string;
  readonly kind: string;
  readonly status: string;
  readonly amountFen: number;
  readonly isRefund: boolean;
  readonly refundAmountFen: number | null;
  readonly relatedTransactionId: string | null;
  readonly currency: string;
  readonly merchant: string | null;
  readonly counterparty: string | null;
  readonly paymentMethod: string | null;
  readonly rawDescription: string | null;
  readonly note: string | null;
  readonly category: string;
  readonly categoryRaw: string | null;
  readonly rawPayloadJson: string;
}

interface CompilableD1Query {
  getQuery?: () => { sql: string; params: unknown[] };
  toSQL?: () => { sql: string; params: unknown[] };
}

const CATEGORY_KEYWORDS: ReadonlyArray<
  readonly [DatabaseTransactionPayload["category"], readonly string[]]
> = [
  ["groceries", ["超市", "便利店", "生鲜", "买菜", "果蔬", "grocery", "groceries", "supermarket", "convenience store", "hema", "盒马", "carrefour", "aldi"]],
  ["restaurant", ["餐饮", "美食", "餐厅", "饭店", "外卖", "火锅", "烧烤", "restaurant", "takeaway", "delivery", "hotpot", "meituan", "饿了么"]],
  ["transport", ["交通", "出行", "滴滴", "地铁", "公交", "铁路", "高铁", "单车", "taxi", "didi", "metro", "subway", "train", "rail"]],
  ["housing", ["房租", "租金", "水费", "电费", "燃气", "物业", "rent", "utilities", "accommodation"]],
  ["travel", ["旅行", "旅游", "酒店", "机票", "航空", "景点", "travel", "hotel", "flight"]],
  ["shopping", ["购物", "淘宝", "天猫", "京东", "商场", "shopping", "mall"]],
  ["leisure", ["娱乐", "电影", "健身", "运动", "咖啡", "奶茶", "ktv", "cinema", "fitness", "game", "coffee", "cafe", "café"]],
  ["health", ["医疗", "医院", "药房", "药店", "health", "clinic", "hospital", "pharmacy"]],
];

function inferCategory(transaction: WalletTransaction): string {
  const haystack = [
    transaction.categoryRaw,
    transaction.counterparty,
    transaction.description,
    ...Object.values(transaction.rawData),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase("zh-CN");
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return category;
  }
  return "other";
}

function toDatabasePayload(
  ownerUserId: string,
  batchId: string,
  transaction: WalletTransaction,
  id = crypto.randomUUID(),
): DatabaseTransactionPayload {
  return {
    id,
    ownerUserId,
    importBatchId: batchId,
    provider: transaction.source,
    sourceId: transaction.sourceId,
    externalTransactionId: transaction.externalTransactionId ?? null,
    merchantOrderId: transaction.merchantOrderId ?? null,
    fingerprint: transaction.fingerprint,
    parserVersion: transaction.parserVersion,
    occurredAt: new Date(transaction.occurredAt).getTime(),
    direction: transaction.direction,
    kind: transaction.kind,
    status: transaction.status,
    amountFen: transaction.amountFen,
    isRefund: transaction.isRefund,
    refundAmountFen: transaction.refundAmountFen ?? null,
    relatedTransactionId: transaction.relatedTransactionId ?? null,
    currency: transaction.currency,
    merchant: transaction.kind === "payment" ? transaction.counterparty ?? null : null,
    counterparty: transaction.counterparty ?? null,
    paymentMethod: transaction.paymentMethod ?? null,
    rawDescription: transaction.description ?? null,
    note: transaction.note ?? null,
    category: inferCategory(transaction),
    categoryRaw: transaction.categoryRaw ?? null,
    rawPayloadJson: JSON.stringify(transaction.rawData),
  };
}

function jsonChunks<T>(rows: readonly T[]): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current: string[] = [];
  let currentBytes = 2;

  for (const row of rows) {
    const serialized = JSON.stringify(row);
    const rowBytes = encoder.encode(serialized).byteLength;
    if (rowBytes + 2 > MAX_D1_JSON_BINDING_BYTES) {
      throw new Error("A normalized transaction exceeds the D1 row limit.");
    }

    const separatorBytes = current.length === 0 ? 0 : 1;
    if (
      current.length > 0 &&
      currentBytes + separatorBytes + rowBytes > MAX_D1_JSON_BINDING_BYTES
    ) {
      chunks.push(`[${current.join(",")}]`);
      current = [];
      currentBytes = 2;
    }

    current.push(serialized);
    currentBytes += (current.length === 1 ? 0 : 1) + rowBytes;
  }

  if (current.length > 0) chunks.push(`[${current.join(",")}]`);
  return chunks;
}

function insertTransactionStatements(
  db: AppDatabase,
  rows: readonly DatabaseTransactionPayload[],
): Array<ReturnType<AppDatabase["run"]>> {
  return jsonChunks(rows).map((chunk) =>
    db.run(sql`
      insert into wallet_transactions (
        id, owner_user_id, import_batch_id, provider, source_id,
        external_transaction_id, merchant_order_id, fingerprint, parser_version,
        occurred_at, direction, kind, status, amount_fen, is_refund,
        refund_amount_fen, related_transaction_id, currency, merchant,
        counterparty, payment_method, raw_description, note, category,
        category_raw, raw_payload_json
      )
      select
        json_extract(value, '$.id'),
        json_extract(value, '$.ownerUserId'),
        json_extract(value, '$.importBatchId'),
        json_extract(value, '$.provider'),
        json_extract(value, '$.sourceId'),
        json_extract(value, '$.externalTransactionId'),
        json_extract(value, '$.merchantOrderId'),
        json_extract(value, '$.fingerprint'),
        json_extract(value, '$.parserVersion'),
        json_extract(value, '$.occurredAt'),
        json_extract(value, '$.direction'),
        json_extract(value, '$.kind'),
        json_extract(value, '$.status'),
        json_extract(value, '$.amountFen'),
        json_extract(value, '$.isRefund'),
        json_extract(value, '$.refundAmountFen'),
        json_extract(value, '$.relatedTransactionId'),
        json_extract(value, '$.currency'),
        json_extract(value, '$.merchant'),
        json_extract(value, '$.counterparty'),
        json_extract(value, '$.paymentMethod'),
        json_extract(value, '$.rawDescription'),
        json_extract(value, '$.note'),
        json_extract(value, '$.category'),
        json_extract(value, '$.categoryRaw'),
        json_extract(value, '$.rawPayloadJson')
      from json_each(${chunk})
      where exists (
        select 1
        from import_batches
        where import_batches.id = json_extract(value, '$.importBatchId')
          and import_batches.owner_user_id = json_extract(value, '$.ownerUserId')
          and import_batches.status in ('pending', 'processing')
      )
      on conflict do nothing
    `),
  );
}

async function runAtomicD1Batch(
  db: AppDatabase,
  statements: readonly CompilableD1Query[],
): Promise<void> {
  const prepared = statements.map((statement) => {
    const query = statement.getQuery?.() ?? statement.toSQL?.();
    if (!query) throw new Error("A D1 batch statement could not be compiled.");
    return db.$client.prepare(query.sql).bind(...query.params);
  });
  await db.$client.batch(prepared);
}

function updateTransactionStatements(
  db: AppDatabase,
  ownerUserId: string,
  batchId: string,
  rows: readonly DatabaseTransactionPayload[],
  updatedAt: Date,
): Array<ReturnType<AppDatabase["run"]>> {
  return jsonChunks(rows).map((chunk) =>
    db.run(sql`
      with incoming as (
        select
          json_extract(value, '$.id') as id,
          json_extract(value, '$.externalTransactionId') as external_transaction_id,
          json_extract(value, '$.merchantOrderId') as merchant_order_id,
          json_extract(value, '$.parserVersion') as parser_version,
          json_extract(value, '$.status') as status,
          case json_extract(value, '$.status')
            when 'pending' then 1
            when 'failed' then 2
            when 'cancelled' then 2
            when 'completed' then 3
            when 'partially_refunded' then 4
            when 'refunded' then 5
            else 0
          end as status_rank,
          json_extract(value, '$.isRefund') as is_refund,
          json_extract(value, '$.refundAmountFen') as refund_amount_fen,
          json_extract(value, '$.relatedTransactionId') as related_transaction_id,
          json_extract(value, '$.merchant') as merchant,
          json_extract(value, '$.counterparty') as counterparty,
          json_extract(value, '$.paymentMethod') as payment_method,
          json_extract(value, '$.rawDescription') as raw_description,
          json_extract(value, '$.note') as note,
          json_extract(value, '$.category') as category,
          json_extract(value, '$.categoryRaw') as category_raw,
          json_extract(value, '$.rawPayloadJson') as raw_payload_json
        from json_each(${chunk})
      )
      update wallet_transactions
      set
        external_transaction_id = (select external_transaction_id from incoming where incoming.id = wallet_transactions.id),
        merchant_order_id = (select merchant_order_id from incoming where incoming.id = wallet_transactions.id),
        parser_version = (select parser_version from incoming where incoming.id = wallet_transactions.id),
        status = (
          select case
            when incoming.status_rank >=
              case wallet_transactions.status
                when 'pending' then 1
                when 'failed' then 2
                when 'cancelled' then 2
                when 'completed' then 3
                when 'partially_refunded' then 4
                when 'refunded' then 5
                else 0
              end
            then incoming.status
            else wallet_transactions.status
          end
          from incoming
          where incoming.id = wallet_transactions.id
        ),
        is_refund = (
          select case
            when wallet_transactions.is_refund = 1 or incoming.is_refund = 1
            then 1
            else 0
          end
          from incoming
          where incoming.id = wallet_transactions.id
        ),
        refund_amount_fen = (
          select nullif(
            max(
              coalesce(wallet_transactions.refund_amount_fen, 0),
              coalesce(incoming.refund_amount_fen, 0)
            ),
            0
          )
          from incoming
          where incoming.id = wallet_transactions.id
        ),
        related_transaction_id = (select related_transaction_id from incoming where incoming.id = wallet_transactions.id),
        merchant = (select merchant from incoming where incoming.id = wallet_transactions.id),
        counterparty = (select counterparty from incoming where incoming.id = wallet_transactions.id),
        payment_method = (select payment_method from incoming where incoming.id = wallet_transactions.id),
        raw_description = (select raw_description from incoming where incoming.id = wallet_transactions.id),
        note = (select note from incoming where incoming.id = wallet_transactions.id),
        category = (select category from incoming where incoming.id = wallet_transactions.id),
        category_raw = (select category_raw from incoming where incoming.id = wallet_transactions.id),
        raw_payload_json = (select raw_payload_json from incoming where incoming.id = wallet_transactions.id),
        updated_at = ${updatedAt.getTime()}
      where owner_user_id = ${ownerUserId}
        and id in (select id from incoming)
        and exists (
          select 1
          from import_batches
          where import_batches.id = ${batchId}
            and import_batches.owner_user_id = ${ownerUserId}
            and import_batches.status in ('pending', 'processing')
        )
    `),
  );
}

function incrementAppliedImportCountStatement(
  db: AppDatabase,
  ownerUserId: string,
  batchId: string,
): ReturnType<AppDatabase["run"]> {
  return db.run(sql`
    update import_batches
    set imported_rows = imported_rows + changes()
    where id = ${batchId}
      and owner_user_id = ${ownerUserId}
      and status in ('pending', 'processing')
  `);
}

function reconcileLinkedExpenseStatements(
  db: AppDatabase,
  ownerUserId: string,
  rows: readonly DatabaseTransactionPayload[],
  updatedAt: Date,
): Array<ReturnType<AppDatabase["run"]>> {
  return jsonChunks(rows).flatMap((chunk) => [
    db.run(sql`
      with incoming_ids as (
        select json_extract(value, '$.id') as id
        from json_each(${chunk})
      ),
      current_wallet as (
        select
          wallet_transactions.id as id,
          wallet_transactions.direction as direction,
          wallet_transactions.status as status,
          max(
            0,
            wallet_transactions.amount_fen -
              coalesce(wallet_transactions.refund_amount_fen, 0)
          ) as effective_amount_fen
        from wallet_transactions
        inner join incoming_ids on incoming_ids.id = wallet_transactions.id
        where wallet_transactions.owner_user_id = ${ownerUserId}
      ),
      targets as (
        select
          wallet_expense_links.expense_id as expense_id,
          current_wallet.effective_amount_fen as effective_amount_fen
        from current_wallet
        inner join wallet_expense_links
          on wallet_expense_links.wallet_transaction_id = current_wallet.id
        inner join expenses
          on expenses.id = wallet_expense_links.expense_id
        where wallet_expense_links.owner_user_id = ${ownerUserId}
          and expenses.status = 'active'
          and expenses.deleted_at is null
          and current_wallet.direction = 'outflow'
          and current_wallet.status in ('completed', 'partially_refunded')
          and current_wallet.effective_amount_fen > 0
      ),
      ranked_shares as (
        select
          expense_shares.id as share_id,
          targets.effective_amount_fen as effective_amount_fen,
          row_number() over (
            partition by expense_shares.expense_id
            order by expense_shares.created_at, expense_shares.id
          ) as share_rank,
          count(*) over (
            partition by expense_shares.expense_id
          ) as share_count
        from expense_shares
        inner join targets on targets.expense_id = expense_shares.expense_id
      )
      update expense_shares
      set amount_fen = (
        select
          cast(ranked_shares.effective_amount_fen / ranked_shares.share_count as integer) +
          case
            when ranked_shares.share_rank <=
              (ranked_shares.effective_amount_fen % ranked_shares.share_count)
            then 1
            else 0
          end
        from ranked_shares
        where ranked_shares.share_id = expense_shares.id
      )
      where id in (select share_id from ranked_shares)
    `),
    db.run(sql`
      with incoming_ids as (
        select json_extract(value, '$.id') as id
        from json_each(${chunk})
      ),
      current_wallet as (
        select
          wallet_transactions.id as id,
          wallet_transactions.direction as direction,
          wallet_transactions.status as status,
          max(
            0,
            wallet_transactions.amount_fen -
              coalesce(wallet_transactions.refund_amount_fen, 0)
          ) as effective_amount_fen
        from wallet_transactions
        inner join incoming_ids on incoming_ids.id = wallet_transactions.id
        where wallet_transactions.owner_user_id = ${ownerUserId}
      )
      update expenses
      set
        amount_fen = (
          select current_wallet.effective_amount_fen
          from current_wallet
          inner join wallet_expense_links
            on wallet_expense_links.wallet_transaction_id = current_wallet.id
          where wallet_expense_links.expense_id = expenses.id
            and wallet_expense_links.owner_user_id = ${ownerUserId}
        ),
        updated_at = ${updatedAt.getTime()}
      where status = 'active'
        and deleted_at is null
        and id in (
          select wallet_expense_links.expense_id
          from current_wallet
          inner join wallet_expense_links
            on wallet_expense_links.wallet_transaction_id = current_wallet.id
          where wallet_expense_links.owner_user_id = ${ownerUserId}
            and current_wallet.direction = 'outflow'
            and current_wallet.status in ('completed', 'partially_refunded')
            and current_wallet.effective_amount_fen > 0
        )
    `),
    db.run(sql`
      with incoming_ids as (
        select json_extract(value, '$.id') as id
        from json_each(${chunk})
      ),
      current_wallet as (
        select
          wallet_transactions.id as id,
          wallet_transactions.direction as direction,
          wallet_transactions.status as status,
          max(
            0,
            wallet_transactions.amount_fen -
              coalesce(wallet_transactions.refund_amount_fen, 0)
          ) as effective_amount_fen
        from wallet_transactions
        inner join incoming_ids on incoming_ids.id = wallet_transactions.id
        where wallet_transactions.owner_user_id = ${ownerUserId}
      )
      update expenses
      set
        status = 'void',
        deleted_at = ${updatedAt.getTime()},
        updated_at = ${updatedAt.getTime()}
      where status = 'active'
        and deleted_at is null
        and id in (
          select wallet_expense_links.expense_id
          from current_wallet
          inner join wallet_expense_links
            on wallet_expense_links.wallet_transaction_id = current_wallet.id
          where wallet_expense_links.owner_user_id = ${ownerUserId}
            and (
              current_wallet.direction <> 'outflow'
              or current_wallet.status not in ('completed', 'partially_refunded')
              or current_wallet.effective_amount_fen <= 0
            )
        )
    `),
  ]);
}

export class DrizzleImportRepository implements ImportRepository {
  constructor(private readonly db: AppDatabase) {}

  async purgeExpiredPreviews(
    ownerUserId: string,
    expiredAt: Date,
  ): Promise<number> {
    const expired = await this.db
      .update(importBatches)
      .set({
        status: "failed",
        previewPayloadJson: null,
        previewExpiresAt: null,
        completedAt: expiredAt,
      })
      .where(
        and(
          eq(importBatches.ownerUserId, ownerUserId),
          or(
            eq(importBatches.status, "pending"),
            eq(importBatches.status, "processing"),
          ),
          lte(importBatches.previewExpiresAt, expiredAt),
        ),
      )
      .returning({ id: importBatches.id });
    return expired.length;
  }

  async findBatchByFileHash(
    ownerUserId: string,
    provider: "wechat" | "alipay",
    sourceFileHash: string,
  ): Promise<ImportBatchRecord | null> {
    const [row] = await this.db
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.ownerUserId, ownerUserId),
          eq(importBatches.provider, provider),
          eq(importBatches.sourceFileHash, sourceFileHash),
        ),
      )
      .limit(1);
    return row ? toBatchRecord(row) : null;
  }

  async savePreview(
    input: SavePreviewInput,
    existingBatchId?: string,
  ): Promise<ImportBatchRecord> {
    const values = {
      ownerUserId: input.ownerUserId,
      provider: input.provider,
      sourceFilename: input.sourceFilename,
      sourceFileHash: input.sourceFileHash,
      fileSizeBytes: input.fileSizeBytes,
      status: "pending" as const,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      totalRows: input.totalRows,
      importedRows: 0,
      duplicateRows: input.duplicateRows,
      skippedRows: input.skippedRows,
      errorRows: input.errorRows,
      errorsJson: JSON.stringify({
        issues: input.errors.slice(0, 500),
        summary: input.summary,
      }),
      previewPayloadJson: input.previewPayloadJson,
      previewExpiresAt: input.previewExpiresAt,
      startedAt: input.startedAt,
      completedAt: null,
    };

    if (existingBatchId) {
      const [updated] = await this.db
        .update(importBatches)
        .set(values)
        .where(
          and(
            eq(importBatches.id, existingBatchId),
            eq(importBatches.ownerUserId, input.ownerUserId),
            ne(importBatches.status, "completed"),
          ),
        )
        .returning();
      if (updated) return toBatchRecord(updated);

      const existing = await this.findBatchByFileHash(
        input.ownerUserId,
        input.provider,
        input.sourceFileHash,
      );
      if (existing) return existing;
    }

    const [inserted] = await this.db
      .insert(importBatches)
      .values(values)
      .onConflictDoNothing()
      .returning();
    if (inserted) return toBatchRecord(inserted);

    const winner = await this.findBatchByFileHash(
      input.ownerUserId,
      input.provider,
      input.sourceFileHash,
    );
    if (!winner) throw new Error("Import preview could not be persisted.");
    if (winner.status === "completed") return winner;

    const [updatedWinner] = await this.db
      .update(importBatches)
      .set(values)
      .where(
        and(
          eq(importBatches.id, winner.id),
          eq(importBatches.ownerUserId, input.ownerUserId),
          ne(importBatches.status, "completed"),
        ),
      )
      .returning();
    return updatedWinner ? toBatchRecord(updatedWinner) : winner;
  }

  async listWalletTransactions(
    ownerUserId: string,
    provider: "wechat" | "alipay",
  ): Promise<readonly PersistedWalletTransaction[]> {
    const rows = await this.db
      .select({
        id: walletTransactions.id,
        provider: walletTransactions.provider,
        sourceId: walletTransactions.sourceId,
        externalTransactionId: walletTransactions.externalTransactionId,
        merchantOrderId: walletTransactions.merchantOrderId,
        fingerprint: walletTransactions.fingerprint,
        occurredAt: walletTransactions.occurredAt,
        direction: walletTransactions.direction,
        status: walletTransactions.status,
        kind: walletTransactions.kind,
        amountFen: walletTransactions.amountFen,
        isRefund: walletTransactions.isRefund,
        refundAmountFen: walletTransactions.refundAmountFen,
        relatedTransactionId: walletTransactions.relatedTransactionId,
        merchant: walletTransactions.merchant,
        counterparty: walletTransactions.counterparty,
        rawDescription: walletTransactions.rawDescription,
        categoryRaw: walletTransactions.categoryRaw,
        paymentMethod: walletTransactions.paymentMethod,
        note: walletTransactions.note,
      })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.ownerUserId, ownerUserId),
          eq(walletTransactions.provider, provider),
        ),
      );
    return rows.map(toPersistedWalletTransaction);
  }

  async findBatchById(
    ownerUserId: string,
    batchId: string,
  ): Promise<ImportBatchRecord | null> {
    const [row] = await this.db
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.id, batchId),
          eq(importBatches.ownerUserId, ownerUserId),
        ),
      )
      .limit(1);
    return row ? toBatchRecord(row) : null;
  }

  async completeBatch(
    ownerUserId: string,
    batchId: string,
    preview: StagedPreview,
    completedAt: Date,
  ): Promise<number> {
    const inserts = preview.actions
      .filter((action): action is Extract<StagedAction, { action: "insert" }> =>
        action.action === "insert",
      )
      .map(({ transaction }) => toDatabasePayload(ownerUserId, batchId, transaction));
    const updates = preview.actions
      .filter((action): action is Extract<StagedAction, { action: "update" }> =>
        action.action === "update",
      )
      .map(({ existingId, transaction }) =>
        toDatabasePayload(ownerUserId, batchId, transaction, existingId),
      );

    const mutations = [
      ...insertTransactionStatements(this.db, inserts),
      ...updateTransactionStatements(
        this.db,
        ownerUserId,
        batchId,
        updates,
        completedAt,
      ),
    ];
    const countedMutations = mutations.flatMap((mutation) => [
      mutation,
      incrementAppliedImportCountStatement(this.db, ownerUserId, batchId),
    ]);
    const finalizeBatch = this.db
      .update(importBatches)
      .set({
        status: "completed",
        duplicateRows: preview.summary.duplicates,
        errorRows: preview.summary.rejected,
        previewPayloadJson: null,
        previewExpiresAt: null,
        completedAt,
      })
      .where(
        and(
          eq(importBatches.id, batchId),
          eq(importBatches.ownerUserId, ownerUserId),
          or(
            eq(importBatches.status, "pending"),
            eq(importBatches.status, "processing"),
          ),
        ),
      );
    const statements = [
      ...countedMutations,
      ...reconcileLinkedExpenseStatements(
        this.db,
        ownerUserId,
        updates,
        completedAt,
      ),
      finalizeBatch,
    ];

    // Each mutation is immediately followed by a changes()-based counter update.
    // The transactional D1 batch therefore records only rows actually applied,
    // including when another preview wins a uniqueness race first.
    await runAtomicD1Batch(this.db, statements);

    const completed = await this.findBatchById(ownerUserId, batchId);
    if (!completed || completed.status !== "completed") {
      throw new Error("Import batch could not be completed.");
    }
    return completed.importedRows;
  }

  async expireBatch(
    ownerUserId: string,
    batchId: string,
    expiredAt: Date,
  ): Promise<void> {
    await this.db
      .update(importBatches)
      .set({
        status: "failed",
        previewPayloadJson: null,
        previewExpiresAt: null,
        completedAt: expiredAt,
      })
      .where(
        and(
          eq(importBatches.id, batchId),
          eq(importBatches.ownerUserId, ownerUserId),
          ne(importBatches.status, "completed"),
        ),
      );
  }

  async listHistory(
    ownerUserId: string,
    limit: number,
  ): Promise<readonly ImportHistoryItem[]> {
    const rows = await this.db
      .select({
        id: importBatches.id,
        provider: importBatches.provider,
        sourceFilename: importBatches.sourceFilename,
        status: importBatches.status,
        totalRows: importBatches.totalRows,
        importedRows: importBatches.importedRows,
        duplicateRows: importBatches.duplicateRows,
        skippedRows: importBatches.skippedRows,
        errorRows: importBatches.errorRows,
        errorsJson: importBatches.errorsJson,
        createdAt: importBatches.createdAt,
        completedAt: importBatches.completedAt,
      })
      .from(importBatches)
      .where(eq(importBatches.ownerUserId, ownerUserId))
      .orderBy(desc(importBatches.createdAt))
      .limit(limit);
    return rows.map(({ errorsJson, ...row }) => ({
      ...row,
      totalFen: parseStoredSummary(errorsJson).totalFen,
    }));
  }
}

export const __testables = {
  inferCategory,
  incrementAppliedImportCountStatement,
  jsonChunks,
  reconcileLinkedExpenseStatements,
  runAtomicD1Batch,
  toDatabasePayload,
};
