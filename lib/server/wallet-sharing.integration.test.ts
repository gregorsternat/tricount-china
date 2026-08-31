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

import { shareWalletTransactionWithGroup } from "./wallet-sharing";

const OWNER_ID = "user-wallet-owner";
const FRIEND_ID = "user-wallet-friend";
const GROUP_ID = "group-wallet-share";
const WALLET_TRANSACTION_ID = "wallet-transaction-share";

class TwoRequestBatchBarrier extends SqliteD1Database {
  private arrivals = 0;
  private releaseBarrier!: () => void;
  private readonly barrier = new Promise<void>((resolve) => {
    this.releaseBarrier = resolve;
  });
  private batchTail = Promise.resolve();

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

describe("shareWalletTransactionWithGroup", () => {
  let sqlite: DatabaseSync;
  let database: AppDatabase;

  beforeEach(() => {
    sqlite = createMigratedSqliteDatabase();
    const d1 = new TwoRequestBatchBarrier(sqlite);
    database = drizzle(d1 as unknown as D1Database, { schema }) as AppDatabase;

    sqlite
      .prepare(
        "insert into users (id, name, email, email_verified) values (?, ?, ?, ?), (?, ?, ?, ?)",
      )
      .run(
        OWNER_ID,
        "Owner",
        "owner@example.com",
        1,
        FRIEND_ID,
        "Friend",
        "friend@example.com",
        1,
      );
    sqlite
      .prepare("insert into groups (id, owner_user_id, name) values (?, ?, ?)")
      .run(GROUP_ID, OWNER_ID, "China 2026-2027");
    sqlite
      .prepare(
        `insert into group_members (id, group_id, user_id, role, status)
         values (?, ?, ?, 'owner', 'active'), (?, ?, ?, 'member', 'active')`,
      )
      .run(
        "member-wallet-owner",
        GROUP_ID,
        OWNER_ID,
        "member-wallet-friend",
        GROUP_ID,
        FRIEND_ID,
      );
    sqlite
      .prepare(
        `insert into wallet_transactions (
          id, owner_user_id, provider, source_id, fingerprint, parser_version,
          occurred_at, direction, status, amount_fen, currency, merchant, category
        ) values (?, ?, 'wechat', ?, ?, 'test-v1', ?, 'outflow', 'completed', ?, 'CNY', ?, 'food')`,
      )
      .run(
        WALLET_TRANSACTION_ID,
        OWNER_ID,
        "source-wallet-share",
        "fingerprint-wallet-share",
        Date.parse("2026-09-01T12:00:00+08:00"),
        1_001,
        "Noodles",
      );
  });

  afterEach(() => sqlite.close());

  it("commits one expense for concurrent requests and replays every retry", async () => {
    const attempts = await Promise.all([
      shareWalletTransactionWithGroup(
        OWNER_ID,
        WALLET_TRANSACTION_ID,
        GROUP_ID,
        database,
      ),
      shareWalletTransactionWithGroup(
        OWNER_ID,
        WALLET_TRANSACTION_ID,
        GROUP_ID,
        database,
      ),
    ]);

    expect(attempts[0]?.expenseId).toBe(attempts[1]?.expenseId);
    expect(attempts.map(({ replayed }) => replayed).sort()).toEqual([false, true]);

    await expect(
      shareWalletTransactionWithGroup(
        OWNER_ID,
        WALLET_TRANSACTION_ID,
        GROUP_ID,
        database,
      ),
    ).resolves.toEqual({ expenseId: attempts[0]?.expenseId, replayed: true });

    expect(
      sqlite
        .prepare("select count(*) as count from wallet_expense_links")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      sqlite.prepare("select count(*) as count from expenses").get(),
    ).toEqual({ count: 1 });
    expect(
      sqlite
        .prepare(
          "select count(*) as count, sum(amount_fen) as total from expense_shares",
        )
        .get(),
    ).toEqual({ count: 2, total: 1_001 });
    expect(
      sqlite
        .prepare(
          "select count(*) as count from audit_logs where action = 'wallet_transaction.shared'",
        )
        .get(),
    ).toEqual({ count: 1 });
  });

  it("rolls back when a member leaves immediately before the sharing batch", async () => {
    const d1 = new SqliteD1Database(sqlite);
    const raceDatabase = drizzle(d1 as unknown as D1Database, {
      schema,
    }) as AppDatabase;
    d1.beforeNextBatch(() => {
      sqlite
        .prepare(
          "update group_members set status = 'left', left_at = ? where id = ?",
        )
        .run(Date.now(), "member-wallet-friend");
    });

    await expect(
      shareWalletTransactionWithGroup(
        OWNER_ID,
        WALLET_TRANSACTION_ID,
        GROUP_ID,
        raceDatabase,
      ),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });

    expect(sqlite.prepare("select count(*) as count from expenses").get()).toEqual({
      count: 0,
    });
    expect(
      sqlite.prepare("select count(*) as count from expense_shares").get(),
    ).toEqual({ count: 0 });
    expect(
      sqlite.prepare("select count(*) as count from wallet_expense_links").get(),
    ).toEqual({ count: 0 });
  });

  it("rolls back when a full refund wins immediately before the sharing batch", async () => {
    const d1 = new SqliteD1Database(sqlite);
    const raceDatabase = drizzle(d1 as unknown as D1Database, {
      schema,
    }) as AppDatabase;
    d1.beforeNextBatch(() => {
      sqlite
        .prepare(
          `update wallet_transactions
           set status = 'refunded', refund_amount_fen = amount_fen
           where id = ? and owner_user_id = ?`,
        )
        .run(WALLET_TRANSACTION_ID, OWNER_ID);
    });

    await expect(
      shareWalletTransactionWithGroup(
        OWNER_ID,
        WALLET_TRANSACTION_ID,
        GROUP_ID,
        raceDatabase,
      ),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });

    expect(
      sqlite
        .prepare(
          "select status, refund_amount_fen from wallet_transactions where id = ?",
        )
        .get(WALLET_TRANSACTION_ID),
    ).toEqual({ status: "refunded", refund_amount_fen: 1_001 });
    expect(sqlite.prepare("select count(*) as count from expenses").get()).toEqual({
      count: 0,
    });
    expect(
      sqlite.prepare("select count(*) as count from expense_shares").get(),
    ).toEqual({ count: 0 });
    expect(
      sqlite.prepare("select count(*) as count from wallet_expense_links").get(),
    ).toEqual({ count: 0 });
    expect(
      sqlite
        .prepare(
          "select count(*) as count from audit_logs where action = 'wallet_transaction.shared'",
        )
        .get(),
    ).toEqual({ count: 0 });
  });
});
