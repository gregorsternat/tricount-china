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
} from "@/lib/test/sqlite-d1";

import {
  completeIdempotentRequest,
  reserveIdempotencyKey,
} from "./idempotency";
import { createExpenseWithShares, createSettlement } from "./ledger";

const GROUP_ID = "group-idempotency";
const OWNER_USER_ID = "user-idempotency-owner";
const MEMBER_USER_ID = "user-idempotency-member";
const OWNER_MEMBER_ID = "member-idempotency-owner";
const MEMBER_ID = "member-idempotency-debtor";

describe("ledger entity identity after idempotency expiry", () => {
  let sqlite: DatabaseSync;
  let database: AppDatabase;

  beforeEach(() => {
    sqlite = createMigratedSqliteDatabase();
    database = drizzle(
      new SqliteD1Database(sqlite) as unknown as D1Database,
      { schema },
    ) as AppDatabase;

    sqlite
      .prepare(
        "insert into users (id, name, email, email_verified) values (?, ?, ?, ?), (?, ?, ?, ?)",
      )
      .run(
        OWNER_USER_ID,
        "Owner",
        "idempotency-owner@example.com",
        1,
        MEMBER_USER_ID,
        "Member",
        "idempotency-member@example.com",
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
        OWNER_MEMBER_ID,
        GROUP_ID,
        OWNER_USER_ID,
        MEMBER_ID,
        GROUP_ID,
        MEMBER_USER_ID,
      );
  });

  afterEach(() => sqlite.close());

  it("creates a distinct expense and keeps its shares attached when the same key is reused with a different payload", async () => {
    const idempotencyKey = "expired-expense-key";
    const firstBody = { amountFen: 1_000, title: "First expense" };
    const firstReservation = await reserveIdempotencyKey(
      {
        ownerUserId: OWNER_USER_ID,
        scope: "group-expense.create",
        key: idempotencyKey,
        requestBody: firstBody,
      },
      database,
    );
    expect(firstReservation.kind).toBe("started");
    if (firstReservation.kind !== "started") throw new Error("Expected reservation.");

    const first = await createExpense(firstBody, idempotencyKey);
    await completeIdempotentRequest(
      {
        id: firstReservation.id,
        ownerUserId: OWNER_USER_ID,
        responseStatus: 201,
        responseBody: { id: first.id },
        resourceType: "expense",
        resourceId: first.id,
      },
      database,
    );
    sqlite
      .prepare("update idempotency_keys set expires_at = ? where id = ?")
      .run(Date.now() - 1, firstReservation.id);

    const secondBody = { amountFen: 2_000, title: "Second expense" };
    const secondReservation = await reserveIdempotencyKey(
      {
        ownerUserId: OWNER_USER_ID,
        scope: "group-expense.create",
        key: idempotencyKey,
        requestBody: secondBody,
      },
      database,
    );
    expect(secondReservation.kind).toBe("started");
    const second = await createExpense(secondBody, idempotencyKey);

    expect(second.id).not.toBe(first.id);
    expect(
      sqlite
        .prepare(
          `select expense.amount_fen, share.amount_fen as share_amount_fen
           from expenses expense
           inner join expense_shares share on share.expense_id = expense.id
           order by expense.amount_fen`,
        )
        .all(),
    ).toEqual([
      { amount_fen: 1_000, share_amount_fen: 1_000 },
      { amount_fen: 2_000, share_amount_fen: 2_000 },
    ]);
  });

  it("creates distinct settlements for different payloads that reuse a key", async () => {
    await createExpense(
      { amountFen: 10_000, title: "Balance to settle" },
      "initial-balance-expense",
    );
    const occurredAt = new Date("2026-09-02T12:00:00+08:00");
    const first = await createSettlement(
      OWNER_USER_ID,
      {
        groupId: GROUP_ID,
        fromMemberId: MEMBER_ID,
        toMemberId: OWNER_MEMBER_ID,
        amountFen: 1_000,
        occurredAt,
        idempotencyKey: "reused-settlement-key",
      },
      database,
    );
    const second = await createSettlement(
      OWNER_USER_ID,
      {
        groupId: GROUP_ID,
        fromMemberId: MEMBER_ID,
        toMemberId: OWNER_MEMBER_ID,
        amountFen: 2_000,
        occurredAt,
        idempotencyKey: "reused-settlement-key",
      },
      database,
    );

    expect(second.id).not.toBe(first.id);
    expect(
      sqlite
        .prepare("select amount_fen from settlements order by amount_fen")
        .all(),
    ).toEqual([{ amount_fen: 1_000 }, { amount_fen: 2_000 }]);
  });

  function createExpense(
    input: { amountFen: number; title: string },
    idempotencyKey: string,
  ) {
    return createExpenseWithShares(
      OWNER_USER_ID,
      {
        groupId: GROUP_ID,
        title: input.title,
        amountFen: input.amountFen,
        occurredAt: new Date("2026-09-01T12:00:00+08:00"),
        paidByMemberId: OWNER_MEMBER_ID,
        shares: [{ memberId: MEMBER_ID, amountFen: input.amountFen }],
        idempotencyKey,
      },
      database,
    );
  }
});
