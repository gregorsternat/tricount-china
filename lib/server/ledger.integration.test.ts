import { type DatabaseSync } from "node:sqlite";

import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));

import type { AppDatabase } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import {
  createMigratedSqliteDatabase,
  SqliteD1Database,
  type SqliteD1Statement,
} from "@/lib/test/sqlite-d1";

import { createSettlement } from "./ledger";

const GROUP_ID = "group-concurrent-settlement";
const OWNER_USER_ID = "user-creditor";
const DEBTOR_USER_ID = "user-debtor";
const CREDITOR_MEMBER_ID = "member-creditor";
const DEBTOR_MEMBER_ID = "member-debtor";
const AMOUNT_FEN = 10_000;

class TwoRequestBatchBarrier extends SqliteD1Database {
  private arrivals = 0;
  private releaseBarrier!: () => void;
  private readonly barrier = new Promise<void>((resolve) => {
    this.releaseBarrier = resolve;
  });
  private batchTail = Promise.resolve();

  constructor(database: DatabaseSync) {
    super(database);
  }

  override async batch(statements: SqliteD1Statement[]) {
    this.arrivals += 1;
    if (this.arrivals === 2) this.releaseBarrier();
    await this.barrier;

    const previousBatch = this.batchTail;
    let releaseBatch!: () => void;
    this.batchTail = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });
    await previousBatch;

    try {
      return await super.batch(statements);
    } finally {
      releaseBatch();
    }
  }
}

describe("createSettlement", () => {
  let sqlite: DatabaseSync;
  let database: AppDatabase;

  beforeEach(() => {
    sqlite = createMigratedSqliteDatabase();
    const d1 = new TwoRequestBatchBarrier(sqlite);
    database = drizzle(d1 as unknown as D1Database, {
      schema,
    }) as AppDatabase;

    sqlite
      .prepare(
        "insert into users (id, name, email, email_verified) values (?, ?, ?, ?), (?, ?, ?, ?)",
      )
      .run(
        OWNER_USER_ID,
        "Creditor",
        "creditor@example.com",
        1,
        DEBTOR_USER_ID,
        "Debtor",
        "debtor@example.com",
        1,
      );
    sqlite
      .prepare("insert into groups (id, owner_user_id, name) values (?, ?, ?)")
      .run(GROUP_ID, OWNER_USER_ID, "China 2026-2027");
    sqlite
      .prepare(
        `insert into group_members (id, group_id, user_id, role, status)
         values (?, ?, ?, 'owner', 'active'), (?, ?, ?, 'member', 'active')`,
      )
      .run(
        CREDITOR_MEMBER_ID,
        GROUP_ID,
        OWNER_USER_ID,
        DEBTOR_MEMBER_ID,
        GROUP_ID,
        DEBTOR_USER_ID,
      );
    sqlite
      .prepare(
        `insert into expenses (
          id, group_id, created_by_user_id, paid_by_member_id, title,
          amount_fen, occurred_at
        ) values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "expense-creditor-paid",
        GROUP_ID,
        OWNER_USER_ID,
        CREDITOR_MEMBER_ID,
        "Shared rent",
        AMOUNT_FEN,
        Date.parse("2026-09-01T12:00:00+08:00"),
      );
    sqlite
      .prepare(
        `insert into expense_shares (id, expense_id, member_id, amount_fen)
         values (?, ?, ?, ?)`,
      )
      .run(
        "share-debtor",
        "expense-creditor-paid",
        DEBTOR_MEMBER_ID,
        AMOUNT_FEN,
      );
  });

  afterEach(() => sqlite.close());

  it("allows only one of two simultaneous full-balance settlements", async () => {
    const occurredAt = new Date("2026-09-02T08:00:00+08:00");
    const attempts = await Promise.allSettled([
      createSettlement(
        OWNER_USER_ID,
        {
          groupId: GROUP_ID,
          fromMemberId: DEBTOR_MEMBER_ID,
          toMemberId: CREDITOR_MEMBER_ID,
          amountFen: AMOUNT_FEN,
          occurredAt,
          idempotencyKey: "concurrent-settlement-a",
        },
        database,
      ),
      createSettlement(
        OWNER_USER_ID,
        {
          groupId: GROUP_ID,
          fromMemberId: DEBTOR_MEMBER_ID,
          toMemberId: CREDITOR_MEMBER_ID,
          amountFen: AMOUNT_FEN,
          occurredAt,
          idempotencyKey: "concurrent-settlement-b",
        },
        database,
      ),
    ]);

    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected",
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      status: 409,
      code: "CONFLICT",
    });

    expect(
      sqlite
        .prepare(
          `select count(*) as count, coalesce(sum(amount_fen), 0) as total
           from settlements
           where group_id = ? and status = 'active' and deleted_at is null`,
        )
        .get(GROUP_ID),
    ).toEqual({ count: 1, total: AMOUNT_FEN });
    expect(
      sqlite
        .prepare(
          `select count(*) as count
           from audit_logs
           where group_id = ? and action = 'settlement.created'`,
        )
        .get(GROUP_ID),
    ).toEqual({ count: 1 });

    const debtorBalance = sqlite
      .prepare(
        `select
          -coalesce((
            select sum(share.amount_fen)
            from expense_shares share
            inner join expenses expense on expense.id = share.expense_id
            where expense.group_id = ?
              and share.member_id = ?
              and expense.status = 'active'
              and expense.deleted_at is null
          ), 0)
          + coalesce((
            select sum(amount_fen)
            from settlements
            where group_id = ?
              and from_member_id = ?
              and status = 'active'
              and deleted_at is null
          ), 0) as balance_fen`,
      )
      .get(
        GROUP_ID,
        DEBTOR_MEMBER_ID,
        GROUP_ID,
        DEBTOR_MEMBER_ID,
      );
    expect(debtorBalance).toEqual({ balance_fen: 0 });
  });
});
