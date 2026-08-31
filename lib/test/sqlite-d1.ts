import { readFileSync } from "node:fs";
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from "node:sqlite";

export class SqliteD1Statement {
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
    const statement = this.statement();
    if (statement.columns().length > 0) {
      const results = statement.all(...this.parameters);
      const changes = this.database
        .prepare("select changes() as changes")
        .get() as { changes: number | bigint };
      return {
        success: true,
        results,
        meta: { changes: Number(changes.changes) },
      };
    }

    const result = statement.run(...this.parameters);
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
    const columns = statement.columns().map(({ name }) => name);
    statement.setReturnArrays(true);
    const values = statement.all(...this.parameters) as unknown as unknown[][];
    return options?.columnNames ? [columns, ...values] : values;
  }

  private statement(): StatementSync {
    return this.database.prepare(this.query);
  }
}

export class SqliteD1Database {
  private beforeBatchHook?: () => void | Promise<void>;

  constructor(private readonly database: DatabaseSync) {}

  beforeNextBatch(callback: () => void | Promise<void>) {
    this.beforeBatchHook = callback;
  }

  prepare(query: string) {
    return new SqliteD1Statement(this.database, query);
  }

  async batch(statements: SqliteD1Statement[]) {
    const beforeBatch = this.beforeBatchHook;
    this.beforeBatchHook = undefined;
    await beforeBatch?.();

    this.database.exec("begin immediate");
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

export function createMigratedSqliteDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("pragma foreign_keys = on");
  for (const migration of [
    "migrations/0000_oval_zombie.sql",
    "migrations/0001_dapper_mikhail_rasputin.sql",
    "migrations/0002_canonical-group-budget.sql",
    "migrations/0003_pending-invitation-uniqueness.sql",
  ]) {
    const contents = readFileSync(migration, "utf8");
    for (const statement of contents.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  return database;
}
