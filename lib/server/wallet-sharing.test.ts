import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));
vi.mock("./access", () => ({ requireGroupMembership: vi.fn() }));

import { requireGroupMembership } from "./access";
import { MAX_EXPENSE_SHARES } from "./ledger-limits";
import { shareWalletTransactionWithGroup } from "./wallet-sharing";

describe("wallet sharing D1 limits", () => {
  beforeEach(() => vi.clearAllMocks());

  it(`rejects automatic splits above ${MAX_EXPENSE_SHARES} members before constructing the share insert`, async () => {
    vi.mocked(requireGroupMembership).mockResolvedValue({
      id: "member-owner",
      groupId: "group-1",
      userId: "user-1",
      role: "owner",
      status: "active",
    });
    const select = vi
      .fn()
      .mockReturnValueOnce(queryWithLimit([shareableTransaction()]))
      .mockReturnValueOnce(queryWithLimit([]))
      .mockReturnValueOnce(
        queryWithoutLimit(
          Array.from({ length: MAX_EXPENSE_SHARES + 1 }, (_, index) => ({
            id: `member-${index + 1}`,
          })),
        ),
      );
    const database = { select, batch: vi.fn(), insert: vi.fn() };

    await expect(
      shareWalletTransactionWithGroup(
        "user-1",
        "wallet-1",
        "group-1",
        database as unknown as Parameters<
          typeof shareWalletTransactionWithGroup
        >[3],
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(database.insert).not.toHaveBeenCalled();
    expect(database.batch).not.toHaveBeenCalled();
  });
});

function queryWithLimit(rows: unknown[]) {
  const terminal = { where: vi.fn(() => ({ limit: vi.fn(async () => rows) })) };
  return {
    from: vi.fn(() => ({
      ...terminal,
      innerJoin: vi.fn(() => terminal),
    })),
  };
}

function queryWithoutLimit(rows: unknown[]) {
  return {
    from: vi.fn(() => ({ where: vi.fn(async () => rows) })),
  };
}

function shareableTransaction() {
  return {
    id: "wallet-1",
    ownerUserId: "user-1",
    provider: "wechat",
    direction: "outflow",
    status: "completed",
    amountFen: 1_000,
    refundAmountFen: null,
    currency: "CNY",
    merchant: "Merchant",
    counterparty: null,
    rawDescription: null,
    category: "food",
    occurredAt: new Date("2026-09-01T12:00:00+08:00"),
  };
}
