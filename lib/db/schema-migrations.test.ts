import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("ledger schema migrations", () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    database.exec("pragma foreign_keys = on");
    for (const migration of [
      "migrations/0000_oval_zombie.sql",
      "migrations/0001_dapper_mikhail_rasputin.sql",
      "migrations/0002_canonical-group-budget.sql",
    ]) {
      applyMigration(database, migration);
    }
    database.exec(`
      insert into users (id, name, email)
        values ('owner-1', 'Owner', 'owner@example.com');
      insert into groups (id, owner_user_id, name)
        values ('group-1', 'owner-1', 'China');
    `);
  });

  afterEach(() => database.close());

  it("allows one active budget per group and calendar period", () => {
    applyMigration(database, "migrations/0004_monthly-budget-history.sql");
    const insert = database.prepare(`
      insert into budgets (
        id, owner_user_id, group_id, name, period_type, amount_fen,
        starts_at, ends_at, is_active
      ) values (?, 'owner-1', 'group-1', ?, 'month', 100000, ?, ?, ?)
    `);
    insert.run("budget-1", "August", 0, 1000, 1);

    expect(() => insert.run("budget-2", "Duplicate", 0, 1000, 1)).toThrow(
      /UNIQUE constraint failed/u,
    );
    expect(() => insert.run("budget-september", "September", 1001, 2000, 1)).not.toThrow();
    expect(() => insert.run("budget-history", "Archived", 0, 1000, 0)).not.toThrow();
  });

  it("deactivates duplicate active budgets before adding period indexes without deleting history", () => {
    database.exec("drop index budgets_one_active_group_unique");
    database.exec(`
      insert into budgets (
        id, owner_user_id, group_id, name, period_type, amount_fen,
        starts_at, ends_at, is_active, created_at, updated_at
      ) values
        ('group-a', 'owner-1', 'group-1', 'Group A', 'month', 100000,
          0, 1000, 1, 10, 20),
        ('group-b', 'owner-1', 'group-1', 'Group B', 'month', 110000,
          0, 1000, 1, 10, 20),
        ('personal-old', 'owner-1', null, 'Personal old', 'month', 120000,
          0, 1000, 1, 10, 20),
        ('personal-new', 'owner-1', null, 'Personal new', 'month', 130000,
          0, 1000, 1, 10, 30);
    `);

    expect(() =>
      applyMigration(database, "migrations/0004_monthly-budget-history.sql"),
    ).not.toThrow();

    expect(
      database
        .prepare("select id, is_active from budgets order by id")
        .all(),
    ).toEqual([
      { id: "group-a", is_active: 1 },
      { id: "group-b", is_active: 0 },
      { id: "personal-new", is_active: 1 },
      { id: "personal-old", is_active: 0 },
    ]);
    expect(
      database.prepare("select count(*) as count from budgets").get(),
    ).toEqual({ count: 4 });
  });
});

function applyMigration(database: DatabaseSync, path: string) {
  for (const statement of readFileSync(path, "utf8").split(
    "--> statement-breakpoint",
  )) {
    if (statement.trim()) database.exec(statement);
  }
}
