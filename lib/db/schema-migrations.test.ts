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
      for (const statement of readFileSync(migration, "utf8").split(
        "--> statement-breakpoint",
      )) {
        if (statement.trim()) database.exec(statement);
      }
    }
    database.exec(`
      insert into users (id, name, email)
        values ('owner-1', 'Owner', 'owner@example.com');
      insert into groups (id, owner_user_id, name)
        values ('group-1', 'owner-1', 'China');
    `);
  });

  afterEach(() => database.close());

  it("allows exactly one active canonical budget per group", () => {
    const insert = database.prepare(`
      insert into budgets (
        id, owner_user_id, group_id, name, period_type, amount_fen,
        starts_at, ends_at, is_active
      ) values (?, 'owner-1', 'group-1', ?, 'year', 100000, 0, 1000, ?)
    `);
    insert.run("budget-1", "Annual", 1);

    expect(() => insert.run("budget-2", "Duplicate", 1)).toThrow(
      /budgets\.group_id|UNIQUE constraint failed/u,
    );
    expect(() => insert.run("budget-history", "Archived", 0)).not.toThrow();
  });
});
