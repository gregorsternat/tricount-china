import { readFileSync } from "node:fs";
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from "node:sqlite";

import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AppDatabase } from "../../../../lib/db/client";
import {
  WALLET_IMPORT_PARSER_VERSION,
  type WalletTransaction,
} from "../../../../lib/import";

import { DrizzleImportRepository } from "./drizzle-repository";

class SqliteD1Statement {
  private parameters: SQLInputValue[] = [];

  constructor(
    private readonly database: DatabaseSync,
    private readonly query: string,
  ) {}

  bind(...parameters: unknown[]) {
    const statement = new SqliteD1Statement(this.database, this.query);
    statement.parameters = parameters as SQLInputValue[];
    return statement;
  }

  async run() {
    const result = this.statement().run(...this.parameters);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }

  async all() {
    return {
      success: true,
      results: this.statement().all(...this.parameters),
      meta: { changes: 0 },
    };
  }

  async first(column?: string) {
    const row = this.statement().get(...this.parameters) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return column ? row[column] : row;
  }

  async raw(options?: { columnNames?: boolean }) {
    const statement = this.statement();
    const rows = statement.all(...this.parameters) as Record<string, unknown>[];
    const columns = statement.columns().map(({ name }) => name);
    const values = rows.map((row) => columns.map((column) => row[column]));
    return options?.columnNames ? [columns, ...values] : values;
  }

  private statement(): StatementSync {
    return this.database.prepare(this.query);
  }
}

class SqliteD1Database {
  constructor(private readonly database: DatabaseSync) {}

  prepare(query: string) {
    return new SqliteD1Statement(this.database, query);
  }

  async batch(statements: SqliteD1Statement[]) {
    this.database.exec("begin");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("commit");
      return results;
    } catch (error) {
      this.database.exec("rollback");
      throw error;
    }
  }
}

describe("DrizzleImportRepository", () => {
  let sqlite: DatabaseSync;
  let repository: DrizzleImportRepository;

  beforeEach(() => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec("pragma foreign_keys = on");
    for (const migration of [
      "migrations/0000_oval_zombie.sql",
      "migrations/0001_dapper_mikhail_rasputin.sql",
      "migrations/0002_canonical-group-budget.sql",
    ]) {
      const sql = readFileSync(migration, "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim()) sqlite.exec(statement);
      }
    }

    const d1 = new SqliteD1Database(sqlite);
    repository = new DrizzleImportRepository(
      drizzle(d1 as unknown as D1Database) as AppDatabase,
    );
    seedLinkedExpense(sqlite);
  });

  afterEach(() => sqlite.close());

  it("persists a confirmed preview with inferred category and raw wallet data", async () => {
    const startedAt = new Date("2026-09-02T08:00:00+08:00");
    const expiresAt = new Date("2026-09-02T08:15:00+08:00");
    const completedAt = new Date("2026-09-02T08:05:00+08:00");
    const transaction: WalletTransaction = {
      source: "alipay",
      sourceId: "alipay-order-1",
      externalTransactionId: "202609020001",
      merchantOrderId: "merchant-order-1",
      fingerprint: "a".repeat(64),
      parserVersion: WALLET_IMPORT_PARSER_VERSION,
      occurredAt: "2026-09-02T07:30:00+08:00",
      timezone: "Asia/Shanghai",
      amountFen: 4_280,
      currency: "CNY",
      direction: "outflow",
      status: "completed",
      kind: "payment",
      isRefund: false,
      counterparty: "盒马鲜生 中关村店",
      description: "超市购物",
      categoryRaw: "日用百货",
      paymentMethod: "余额宝",
      note: "周末采购",
      rawData: {
        交易号: "202609020001",
        交易对方: "盒马鲜生 中关村店",
        商品说明: "超市购物",
      },
    };
    const stagedPreview = {
      version: 1 as const,
      summary: {
        accepted: 1,
        duplicates: 2,
        rejected: 3,
        totalFen: 4_280,
      },
      actions: [{ action: "insert" as const, transaction }],
    };
    const previewPayloadJson = JSON.stringify(stagedPreview);
    const saved = await repository.savePreview({
      ownerUserId: "user-1",
      provider: "alipay",
      sourceFilename: "alipay-2026.csv",
      sourceFileHash: "b".repeat(64),
      fileSizeBytes: 2_048,
      periodStart: new Date("2026-09-01T00:00:00+08:00"),
      periodEnd: new Date("2026-09-02T23:59:59+08:00"),
      totalRows: 6,
      duplicateRows: 2,
      skippedRows: 0,
      errorRows: 3,
      errors: [],
      summary: stagedPreview.summary,
      previewPayloadJson,
      previewExpiresAt: expiresAt,
      startedAt,
    });

    expect(saved).toMatchObject({
      ownerUserId: "user-1",
      provider: "alipay",
      status: "pending",
      totalFen: 4_280,
      previewPayloadJson,
    });

    await repository.completeBatch(
      "user-1",
      saved.id,
      stagedPreview,
      completedAt,
    );

    const wallet = row(
      sqlite,
      `select
        owner_user_id, import_batch_id, provider, source_id,
        external_transaction_id, merchant_order_id, category, category_raw,
        raw_payload_json, amount_fen, direction, status
      from wallet_transactions where source_id = 'alipay-order-1'`,
    );
    expect(wallet).toMatchObject({
      owner_user_id: "user-1",
      import_batch_id: saved.id,
      provider: "alipay",
      source_id: "alipay-order-1",
      external_transaction_id: "202609020001",
      merchant_order_id: "merchant-order-1",
      category: "food",
      category_raw: "日用百货",
      amount_fen: 4_280,
      direction: "outflow",
      status: "completed",
    });
    expect(JSON.parse(String(wallet.raw_payload_json))).toEqual(
      transaction.rawData,
    );

    const batch = row(
      sqlite,
      `select
        status, imported_rows, duplicate_rows, error_rows,
        preview_payload_json, preview_expires_at, completed_at
      from import_batches where id = '${saved.id}'`,
    );
    expect(batch).toMatchObject({
      status: "completed",
      imported_rows: 1,
      duplicate_rows: 2,
      error_rows: 3,
      preview_payload_json: null,
      preview_expires_at: null,
      completed_at: completedAt.getTime(),
    });

    const persisted = await repository.listWalletTransactions(
      "user-1",
      "alipay",
    );
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.transaction).toMatchObject({
      sourceId: "alipay-order-1",
      categoryRaw: "日用百货",
      // Merge scans intentionally omit raw provider payloads to remain inside
      // the Worker's memory budget; the database assertion above proves that
      // the payload itself is still retained for auditability.
      rawData: {},
    });
  });

  it("purges only expired pending previews and keeps completed imports intact", async () => {
    const expiry = new Date("2026-09-03T08:00:00+08:00");
    const previewPayloadJson = JSON.stringify({ version: 1, actions: [] });
    const insertBatch = sqlite.prepare(
      `insert into import_batches (
        id, owner_user_id, provider, source_filename, source_file_hash,
        status, preview_payload_json, preview_expires_at
      ) values (?, 'user-1', 'alipay', ?, ?, ?, ?, ?)`,
    );
    insertBatch.run(
      "batch-expired",
      "expired.csv",
      "expired-hash",
      "pending",
      previewPayloadJson,
      expiry.getTime() - 1,
    );
    insertBatch.run(
      "batch-fresh",
      "fresh.csv",
      "fresh-hash",
      "processing",
      previewPayloadJson,
      expiry.getTime() + 1,
    );
    insertBatch.run(
      "batch-completed",
      "completed.csv",
      "completed-hash",
      "completed",
      null,
      expiry.getTime() - 1,
    );

    await expect(
      repository.purgeExpiredPreviews("user-1", expiry),
    ).resolves.toBe(1);
    expect(
      row(
        sqlite,
        "select status, preview_payload_json, preview_expires_at, completed_at from import_batches where id = 'batch-expired'",
      ),
    ).toMatchObject({
      status: "failed",
      preview_payload_json: null,
      preview_expires_at: null,
      completed_at: expiry.getTime(),
    });
    expect(
      row(
        sqlite,
        "select status, preview_payload_json from import_batches where id = 'batch-fresh'",
      ),
    ).toMatchObject({
      status: "processing",
      preview_payload_json: previewPayloadJson,
    });
    expect(
      row(
        sqlite,
        "select status from import_batches where id = 'batch-completed'",
      ),
    ).toMatchObject({ status: "completed" });
  });

  it("counts only wallet rows applied after overlapping previews are confirmed", async () => {
    sqlite.exec(`
      insert into import_batches (
        id, owner_user_id, provider, source_filename, source_file_hash, status,
        total_rows, imported_rows, duplicate_rows, skipped_rows, error_rows,
        started_at
      ) values
        ('batch-overlap-a', 'user-1', 'wechat', 'wechat-a.csv', 'hash-a',
          'pending', 1, 0, 0, 0, 0, 0),
        ('batch-overlap-b', 'user-1', 'wechat', 'wechat-b.csv', 'hash-b',
          'pending', 1, 0, 0, 0, 0, 0)
    `);
    const transaction: WalletTransaction = {
      ...statusUpdate("completed"),
      sourceId: "overlapping-source",
      fingerprint: "overlapping-fingerprint",
    };
    const preview = {
      version: 1 as const,
      summary: { accepted: 1, duplicates: 0, rejected: 0, totalFen: 1_000 },
      actions: [{ action: "insert" as const, transaction }],
    };

    await expect(
      repository.completeBatch(
        "user-1",
        "batch-overlap-a",
        preview,
        new Date("2026-09-04T12:00:00+08:00"),
      ),
    ).resolves.toBe(1);
    await expect(
      repository.completeBatch(
        "user-1",
        "batch-overlap-b",
        preview,
        new Date("2026-09-04T12:00:01+08:00"),
      ),
    ).resolves.toBe(0);

    expect(
      row(
        sqlite,
        "select imported_rows from import_batches where id = 'batch-overlap-a'",
      ),
    ).toMatchObject({ imported_rows: 1 });
    expect(
      row(
        sqlite,
        "select imported_rows from import_batches where id = 'batch-overlap-b'",
      ),
    ).toMatchObject({ imported_rows: 0 });
    expect(
      row(
        sqlite,
        "select count(*) as count from wallet_transactions where source_id = 'overlapping-source'",
      ),
    ).toMatchObject({ count: 1 });
  });

  it("reclassifies an existing transaction when a richer import adds category evidence", async () => {
    const transaction: WalletTransaction = {
      ...statusUpdate("completed"),
      counterparty: "淘宝旗舰店",
      description: "购物订单",
      categoryRaw: "网购",
      rawData: { 商品说明: "淘宝购物" },
    };

    await repository.completeBatch(
      "user-1",
      "batch-1",
      previewFor(transaction),
      new Date("2026-09-05T12:00:00+08:00"),
    );

    expect(
      row(
        sqlite,
        "select category, category_raw from wallet_transactions where id = 'wallet-1'",
      ),
    ).toMatchObject({ category: "shopping", category_raw: "网购" });
  });

  it("reduces a shared expense and redistributes exact shares after a partial refund", async () => {
    await repository.completeBatch(
      "user-1",
      "batch-1",
      previewFor(statusUpdate("partially_refunded", 400)),
      new Date("2026-09-05T12:00:00+08:00"),
    );

    const wallet = row(sqlite, "select status, refund_amount_fen from wallet_transactions where id = 'wallet-1'");
    const expense = row(sqlite, "select status, amount_fen from expenses where id = 'expense-1'");
    const shares = sqlite
      .prepare("select amount_fen from expense_shares where expense_id = 'expense-1' order by id")
      .all() as Array<{ amount_fen: number }>;

    expect(wallet).toMatchObject({
      status: "partially_refunded",
      refund_amount_fen: 400,
    });
    expect(expense).toMatchObject({ status: "active", amount_fen: 600 });
    expect(shares.map(({ amount_fen }) => amount_fen)).toEqual([200, 200, 200]);
    expect(
      row(sqlite, "select status from import_batches where id = 'batch-1'"),
    ).toMatchObject({ status: "completed" });
  });

  it("voids the linked expense when a later import marks the payment refunded", async () => {
    await repository.completeBatch(
      "user-1",
      "batch-1",
      previewFor(statusUpdate("refunded", 1_000)),
      new Date("2026-09-05T12:00:00+08:00"),
    );

    expect(
      row(
        sqlite,
        "select status, deleted_at from expenses where id = 'expense-1'",
      ),
    ).toMatchObject({ status: "void" });
    expect(
      row(
        sqlite,
        "select deleted_at is not null as deleted from expenses where id = 'expense-1'",
      ),
    ).toMatchObject({ deleted: 1 });
  });

  it("does not let an older confirmed preview downgrade a newer refund state", async () => {
    sqlite.exec(`
      insert into import_batches (
        id, owner_user_id, provider, source_filename, source_file_hash, status,
        total_rows, imported_rows, duplicate_rows, skipped_rows, error_rows,
        started_at
      ) values (
        'batch-stale', 'user-1', 'wechat', 'wechat-stale.csv', 'hash-stale',
        'pending', 1, 0, 0, 0, 0, 0
      )
    `);
    const confirmedAt = new Date("2026-09-05T12:00:00+08:00");
    await repository.completeBatch(
      "user-1",
      "batch-1",
      previewFor(statusUpdate("partially_refunded", 400)),
      confirmedAt,
    );

    await repository.completeBatch(
      "user-1",
      "batch-stale",
      previewFor(statusUpdate("completed")),
      new Date(confirmedAt.getTime() + 1_000),
    );

    expect(
      row(
        sqlite,
        "select status, refund_amount_fen from wallet_transactions where id = 'wallet-1'",
      ),
    ).toMatchObject({
      status: "partially_refunded",
      refund_amount_fen: 400,
    });
    expect(
      row(
        sqlite,
        "select status, amount_fen from expenses where id = 'expense-1'",
      ),
    ).toMatchObject({ status: "active", amount_fen: 600 });
  });
});

function previewFor(transaction: WalletTransaction) {
  return {
    version: 1 as const,
    summary: { accepted: 1, duplicates: 0, rejected: 0, totalFen: 1_000 },
    actions: [
      { action: "update" as const, existingId: "wallet-1", transaction },
    ],
  };
}

function statusUpdate(
  status: "completed" | "partially_refunded" | "refunded",
  refundAmountFen?: number,
): WalletTransaction {
  return {
    source: "wechat",
    sourceId: "source-1",
    fingerprint: "fingerprint-1",
    parserVersion: WALLET_IMPORT_PARSER_VERSION,
    occurredAt: "2026-09-01T12:00:00+08:00",
    timezone: "Asia/Shanghai",
    amountFen: 1_000,
    currency: "CNY",
    direction: "outflow",
    status,
    kind: "payment",
    isRefund: refundAmountFen !== undefined,
    refundAmountFen,
    counterparty: "Merchant",
    rawData: {},
  };
}

function seedLinkedExpense(database: DatabaseSync) {
  database.exec(`
    insert into users (id, name, email) values ('user-1', 'Gregor', 'gregor@example.com');
    insert into users (id, name, email) values ('user-2', 'Friend 1', 'friend1@example.com');
    insert into users (id, name, email) values ('user-3', 'Friend 2', 'friend2@example.com');
    insert into groups (id, owner_user_id, name) values ('group-1', 'user-1', 'China');
    insert into group_members (id, group_id, user_id, role) values ('member-1', 'group-1', 'user-1', 'owner');
    insert into group_members (id, group_id, user_id, role) values ('member-2', 'group-1', 'user-2', 'member');
    insert into group_members (id, group_id, user_id, role) values ('member-3', 'group-1', 'user-3', 'member');
    insert into import_batches (
      id, owner_user_id, provider, source_filename, source_file_hash, status,
      total_rows, imported_rows, duplicate_rows, skipped_rows, error_rows,
      started_at
    ) values (
      'batch-1', 'user-1', 'wechat', 'wechat.csv', 'hash-1', 'pending',
      1, 0, 0, 0, 0, 0
    );
    insert into wallet_transactions (
      id, owner_user_id, import_batch_id, provider, source_id, fingerprint,
      parser_version, occurred_at, direction, kind, status, amount_fen,
      is_refund, currency, category
    ) values (
      'wallet-1', 'user-1', 'batch-1', 'wechat', 'source-1', 'fingerprint-1',
      'wallet-import/1.0.0', 1788235200000, 'outflow', 'payment', 'completed',
      1000, 0, 'CNY', 'food'
    );
    insert into expenses (
      id, group_id, created_by_user_id, paid_by_member_id, title, category,
      amount_fen, currency, occurred_at, source
    ) values (
      'expense-1', 'group-1', 'user-1', 'member-1', 'Merchant', 'food',
      1000, 'CNY', 1788235200000, 'wechat'
    );
    insert into expense_shares (id, expense_id, member_id, amount_fen)
      values ('share-1', 'expense-1', 'member-1', 334);
    insert into expense_shares (id, expense_id, member_id, amount_fen)
      values ('share-2', 'expense-1', 'member-2', 333);
    insert into expense_shares (id, expense_id, member_id, amount_fen)
      values ('share-3', 'expense-1', 'member-3', 333);
    insert into wallet_expense_links (
      id, owner_user_id, wallet_transaction_id, expense_id
    ) values ('link-1', 'user-1', 'wallet-1', 'expense-1');
  `);
}

function row(database: DatabaseSync, query: string): Record<string, unknown> {
  return database.prepare(query).get() as Record<string, unknown>;
}
