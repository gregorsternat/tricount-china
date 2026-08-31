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

import { removeGroupMember } from "./groups";
import { createExpenseWithShares } from "./ledger";

const GROUP_ID = "group-member-removal";
const OWNER_USER_ID = "user-owner";
const MEMBER_USER_ID = "user-member";
const OWNER_MEMBER_ID = "member-owner";
const MEMBER_ID = "member-to-remove";

describe("group member ledger integrity", () => {
  let sqlite: DatabaseSync;
  let d1: SqliteD1Database;
  let database: AppDatabase;

  beforeEach(() => {
    sqlite = createMigratedSqliteDatabase();
    d1 = new SqliteD1Database(sqlite);
    database = drizzle(d1 as unknown as D1Database, { schema }) as AppDatabase;

    sqlite
      .prepare(
        "insert into users (id, name, email, email_verified) values (?, ?, ?, ?), (?, ?, ?, ?)",
      )
      .run(
        OWNER_USER_ID,
        "Owner",
        "owner@example.com",
        1,
        MEMBER_USER_ID,
        "Member",
        "member@example.com",
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

  it("blocks removing a member whose active ledger balance is not settled without writing an audit", async () => {
    await createSharedExpense("existing-balance");

    await expect(
      removeGroupMember(OWNER_USER_ID, GROUP_ID, MEMBER_USER_ID, database),
    ).rejects.toMatchObject({
      status: 409,
      message: "Settle this member's balance before removing them from the group.",
    });

    expect(memberStatus()).toEqual({ status: "active", left_at: null });
    expect(auditCount("group.member_removed")).toEqual({ count: 0 });
  });

  it("rejects an expense when removal commits after its membership preflight", async () => {
    d1.beforeNextBatch(async () => {
      await removeGroupMember(OWNER_USER_ID, GROUP_ID, MEMBER_USER_ID, database);
    });

    await expect(createSharedExpense("removal-wins")).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    });

    expect(memberStatus()).toMatchObject({ status: "left" });
    expect(
      sqlite.prepare("select count(*) as count from expenses").get(),
    ).toEqual({ count: 0 });
    expect(
      sqlite.prepare("select count(*) as count from expense_shares").get(),
    ).toEqual({ count: 0 });
    expect(auditCount("expense.created")).toEqual({ count: 0 });
    expect(auditCount("group.member_removed")).toEqual({ count: 1 });
  });

  it("keeps the member active and writes no removal audit when an expense commits first", async () => {
    d1.beforeNextBatch(async () => {
      await createSharedExpense("expense-wins");
    });

    await expect(
      removeGroupMember(OWNER_USER_ID, GROUP_ID, MEMBER_USER_ID, database),
    ).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    });

    expect(memberStatus()).toEqual({ status: "active", left_at: null });
    expect(
      sqlite.prepare("select count(*) as count from expenses").get(),
    ).toEqual({ count: 1 });
    expect(
      sqlite.prepare("select count(*) as count from expense_shares").get(),
    ).toEqual({ count: 1 });
    expect(auditCount("expense.created")).toEqual({ count: 1 });
    expect(auditCount("group.member_removed")).toEqual({ count: 0 });
  });

  async function createSharedExpense(idempotencyKey: string) {
    return createExpenseWithShares(
      OWNER_USER_ID,
      {
        groupId: GROUP_ID,
        title: "Shared rent",
        amountFen: 10_000,
        occurredAt: new Date("2026-09-01T12:00:00+08:00"),
        paidByMemberId: OWNER_MEMBER_ID,
        shares: [{ memberId: MEMBER_ID, amountFen: 10_000 }],
        idempotencyKey,
      },
      database,
    );
  }

  function memberStatus() {
    return sqlite
      .prepare("select status, left_at from group_members where id = ?")
      .get(MEMBER_ID);
  }

  function auditCount(action: string) {
    return sqlite
      .prepare(
        "select count(*) as count from audit_logs where group_id = ? and action = ?",
      )
      .get(GROUP_ID, action);
  }
});
