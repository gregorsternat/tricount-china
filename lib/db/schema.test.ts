import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  accounts,
  auditLogs,
  budgets,
  categorizationRules,
  expenseShares,
  expenses,
  fxRates,
  groupMembers,
  groups,
  idempotencyKeys,
  importBatches,
  invitations,
  rateLimits,
  sessions,
  settlements,
  users,
  verifications,
  walletExpenseLinks,
  walletTransactions,
} from "./schema";

const tables = [
  users,
  sessions,
  accounts,
  verifications,
  rateLimits,
  groups,
  groupMembers,
  invitations,
  expenses,
  expenseShares,
  settlements,
  importBatches,
  walletTransactions,
  walletExpenseLinks,
  categorizationRules,
  budgets,
  fxRates,
  idempotencyKeys,
  auditLogs,
];

describe("database schema", () => {
  it("contains the complete collaboration, wallet and security model", () => {
    expect(tables.map(getTableName)).toEqual([
      "users",
      "sessions",
      "accounts",
      "verifications",
      "rate_limits",
      "groups",
      "group_members",
      "invitations",
      "expenses",
      "expense_shares",
      "settlements",
      "import_batches",
      "wallet_transactions",
      "wallet_expense_links",
      "categorization_rules",
      "budgets",
      "fx_rates",
      "idempotency_keys",
      "audit_logs",
    ]);
  });

  it("matches the Better Auth 1.7 core columns", () => {
    expect(Object.keys(getTableColumns(users))).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "email",
        "emailVerified",
        "image",
        "createdAt",
        "updatedAt",
      ]),
    );
    expect(Object.keys(getTableColumns(sessions))).toEqual(
      expect.arrayContaining(["id", "token", "expiresAt", "userId"]),
    );
    expect(Object.keys(getTableColumns(accounts))).toEqual(
      expect.arrayContaining([
        "id",
        "issuer",
        "accountId",
        "providerId",
        "userId",
        "password",
      ]),
    );
    expect(Object.keys(getTableColumns(verifications))).toEqual(
      expect.arrayContaining(["identifier", "value", "expiresAt"]),
    );
    expect(Object.keys(getTableColumns(rateLimits))).toEqual(
      expect.arrayContaining(["key", "count", "lastRequest"]),
    );
  });

  it("keeps every private wallet artifact explicitly owner scoped", () => {
    for (const table of [
      importBatches,
      walletTransactions,
      walletExpenseLinks,
      categorizationRules,
      budgets,
      idempotencyKeys,
      auditLogs,
    ]) {
      expect(getTableColumns(table)).toHaveProperty("ownerUserId");
    }
  });

  it("stores the fields required for secure staged and deduplicated imports", () => {
    expect(Object.keys(getTableColumns(importBatches))).toEqual(
      expect.arrayContaining([
        "sourceFileHash",
        "previewPayloadJson",
        "previewExpiresAt",
        "status",
      ]),
    );
    expect(Object.keys(getTableColumns(walletTransactions))).toEqual(
      expect.arrayContaining([
        "sourceId",
        "fingerprint",
        "parserVersion",
        "refundAmountFen",
        "rawPayloadJson",
      ]),
    );
    expect(walletTransactions.provider.enumValues).toEqual([
      "manual",
      "wechat",
      "alipay",
    ]);
    expect(importBatches.provider.enumValues).toEqual(["wechat", "alipay"]);
  });
});
