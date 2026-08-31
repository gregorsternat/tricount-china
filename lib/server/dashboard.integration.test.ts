import { type DatabaseSync } from "node:sqlite";

import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));

import type { AppDatabase } from "@/lib/db/client";
import { monthPeriod } from "@/lib/dashboard/period";
import * as schema from "@/lib/db/schema";
import {
  createMigratedSqliteDatabase,
  SqliteD1Database,
} from "@/lib/test/sqlite-d1";

import { getDashboardSnapshot } from "./dashboard";

describe("dashboard scope and all-time ledger integration", () => {
  let sqlite: DatabaseSync;
  let database: AppDatabase;

  beforeEach(() => {
    sqlite = createMigratedSqliteDatabase();
    database = drizzle(
      new SqliteD1Database(sqlite) as unknown as D1Database,
      { schema },
    ) as AppDatabase;
    seedDashboard(sqlite);
  });

  afterEach(() => sqlite.close());

  it("keeps personal scope independent from the first available group period", async () => {
    const snapshot = await getDashboardSnapshot(
      "user-1",
      "personal",
      undefined,
      {},
      database,
    );

    expect(snapshot.group).toBeNull();
    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.groups[0]?.id).toBe("group-1");
    expect(snapshot.period.from?.getUTCFullYear()).not.toBe(2035);
    expect(snapshot.period.to?.getUTCFullYear()).not.toBe(2036);
  });

  it("includes active post-period expenses and settlements in balances without polluting period analytics", async () => {
    const snapshot = await getDashboardSnapshot(
      "user-1",
      "group",
      "group-1",
      {},
      database,
    );

    expect(snapshot.group?.expenses).toEqual([]);
    expect(snapshot.group?.settlements).toEqual([]);
    expect(snapshot.group?.analytics.totalExpensesFen).toBe(0);
    expect(snapshot.group?.analytics.balances).toEqual([
      { memberId: "member-1", balanceFen: 300 },
      { memberId: "member-2", balanceFen: -300 },
    ]);
  });

  it("loads only active total monthly budgets for the exact month plus a legacy annual fallback", async () => {
    const august = monthPeriod("2026-08");
    const july = monthPeriod("2026-07");
    const annualFrom = Date.parse("2025-09-01T00:00:00+08:00");
    const annualTo = Date.parse("2026-08-31T23:59:59.999+08:00");
    const insert = sqlite.prepare(`
      insert into budgets (
        id, owner_user_id, group_id, name, category, period_type,
        amount_fen, starts_at, ends_at, is_active
      ) values (?, 'user-1', ?, ?, ?, ?, 120000, ?, ?, ?)
    `);
    insert.run("personal-month", null, "Personal month", null, "month", august.from.getTime(), august.to.getTime(), 1);
    insert.run("personal-annual", null, "Personal annual", null, "year", annualFrom, annualTo, 1);
    insert.run("personal-category", null, "Food", "food", "month", august.from.getTime(), august.to.getTime(), 1);
    insert.run("personal-custom", null, "Custom", null, "custom", august.from.getTime(), august.to.getTime(), 1);
    insert.run("personal-other-month", null, "July", null, "month", july.from.getTime(), july.to.getTime(), 1);
    insert.run("personal-inactive", null, "Inactive", null, "month", august.from.getTime(), august.to.getTime(), 0);
    insert.run("group-month", "group-1", "Group month", null, "month", august.from.getTime(), august.to.getTime(), 1);
    insert.run("group-annual", "group-1", "Group annual", null, "year", annualFrom, annualTo, 1);
    insert.run("group-category", "group-1", "Group food", "food", "month", august.from.getTime(), august.to.getTime(), 1);

    const personal = await getDashboardSnapshot(
      "user-1",
      "personal",
      undefined,
      { from: august.from, to: august.to },
      database,
    );
    const group = await getDashboardSnapshot(
      "user-1",
      "group",
      "group-1",
      { from: august.from, to: august.to },
      database,
    );

    expect(personal.budgets.map(({ id }) => id).sort()).toEqual([
      "personal-annual",
      "personal-month",
    ]);
    expect(
      group.group?.budgets
        .filter(({ groupId }) => groupId === "group-1")
        .map(({ id }) => id)
        .sort(),
    ).toEqual(["group-annual", "group-month"]);
  });
});

function seedDashboard(database: DatabaseSync) {
  database.exec(`
    insert into users (id, name, email)
      values ('user-1', 'Owner', 'owner@example.com');
    insert into users (id, name, email)
      values ('user-2', 'Friend', 'friend@example.com');
    insert into groups (
      id, owner_user_id, name, starts_at, ends_at, academic_year_label
    ) values (
      'group-1', 'user-1', 'Future group',
      2051222400000, 2082844799999, '2035–2036'
    );
    insert into group_members (id, group_id, user_id, role)
      values ('member-1', 'group-1', 'user-1', 'owner');
    insert into group_members (id, group_id, user_id, role)
      values ('member-2', 'group-1', 'user-2', 'member');
    insert into expenses (
      id, group_id, created_by_user_id, paid_by_member_id, title, category,
      amount_fen, occurred_at
    ) values (
      'expense-after', 'group-1', 'user-1', 'member-1', 'After period',
      'travel', 1000, 2082931200000
    );
    insert into expense_shares (id, expense_id, member_id, amount_fen)
      values ('share-owner', 'expense-after', 'member-1', 500);
    insert into expense_shares (id, expense_id, member_id, amount_fen)
      values ('share-friend', 'expense-after', 'member-2', 500);
    insert into settlements (
      id, group_id, created_by_user_id, from_member_id, to_member_id,
      amount_fen, occurred_at
    ) values (
      'settlement-after', 'group-1', 'user-2', 'member-2', 'member-1',
      200, 2083017600000
    );
  `);
}
