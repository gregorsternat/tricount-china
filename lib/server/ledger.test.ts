import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db/client", () => ({ getDb: vi.fn() }));
vi.mock("./access", () => ({
  requireGroupMembership: vi.fn(),
  requireGroupOwner: vi.fn(),
}));

import { requireGroupMembership, requireGroupOwner } from "./access";
import {
  createExpenseWithShares,
  MAX_EXPENSE_SHARES,
  upsertBudget,
} from "./ledger";

describe("budget persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates an overlapping logical budget when no explicit id is provided", async () => {
    const startsAt = new Date("2026-09-01T00:00:00+08:00");
    const endsAt = new Date("2027-06-30T23:59:59+08:00");
    const savedBudget = {
      id: "budget-existing",
      ownerUserId: "user-1",
      groupId: null,
      name: "Annual personal budget",
      category: null,
      periodType: "year" as const,
      amountFen: 250_000,
      currency: "CNY",
      startsAt,
      endsAt,
      rollover: false,
      alertThresholdBasisPoints: 8_000,
      isActive: true,
      createdAt: new Date("2026-08-01T00:00:00Z"),
      updatedAt: new Date("2026-08-31T00:00:00Z"),
    };
    const limit = vi
      .fn()
      .mockResolvedValueOnce([{ id: savedBudget.id }])
      .mockResolvedValueOnce([savedBudget]);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ limit, orderBy }));
    const select = vi.fn(() => ({
      from: vi.fn(() => ({ where })),
    }));
    const budgetValues = vi.fn(() => ({
      onConflictDoUpdate: vi.fn(() => ({ kind: "budget-upsert" })),
    }));
    const auditValues = vi.fn(() => ({ kind: "audit-insert" }));
    const insert = vi
      .fn()
      .mockReturnValueOnce({ values: budgetValues })
      .mockReturnValueOnce({ values: auditValues });
    const batch = vi.fn(async () => []);
    const database = { select, insert, batch };

    const result = await upsertBudget(
      "user-1",
      {
        name: savedBudget.name,
        periodType: "year",
        amountFen: savedBudget.amountFen,
        currency: "CNY",
        startsAt,
        endsAt,
      },
      database as unknown as Parameters<typeof upsertBudget>[2],
    );

    expect(result.id).toBe(savedBudget.id);
    expect(budgetValues).toHaveBeenCalledWith(
      expect.objectContaining({ id: savedBudget.id, amountFen: 250_000 }),
    );
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "budget.updated",
        entityId: savedBudget.id,
      }),
    );
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it("uses the one canonical active group budget and requires the group owner", async () => {
    const startsAt = new Date("2026-09-01T00:00:00+08:00");
    const endsAt = new Date("2027-08-31T23:59:59+08:00");
    const savedBudget = {
      id: "group-budget-existing",
      ownerUserId: "owner-1",
      groupId: "group-1",
      name: "Budget du tricount",
      category: null,
      periodType: "year" as const,
      amountFen: 500_000,
      currency: "CNY",
      startsAt,
      endsAt,
      rollover: false,
      alertThresholdBasisPoints: 8_000,
      isActive: true,
      createdAt: new Date("2026-08-01T00:00:00Z"),
      updatedAt: new Date("2026-08-31T00:00:00Z"),
    };
    vi.mocked(requireGroupOwner).mockResolvedValue({
      id: "group-1",
      ownerUserId: "owner-1",
    });
    const limit = vi
      .fn()
      .mockResolvedValueOnce([{ id: savedBudget.id }])
      .mockResolvedValueOnce([savedBudget]);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ limit, orderBy }));
    const select = vi.fn(() => ({ from: vi.fn(() => ({ where })) }));
    const budgetValues = vi.fn(() => ({
      onConflictDoUpdate: vi.fn(() => ({ kind: "budget-upsert" })),
    }));
    const auditValues = vi.fn(() => ({ kind: "audit-insert" }));
    const insert = vi
      .fn()
      .mockReturnValueOnce({ values: budgetValues })
      .mockReturnValueOnce({ values: auditValues });
    const batch = vi.fn(async () => []);
    const database = { select, insert, batch };

    const result = await upsertBudget(
      "owner-1",
      {
        groupId: "group-1",
        name: "Budget du tricount",
        periodType: "year",
        amountFen: 500_000,
        startsAt,
        endsAt,
      },
      database as unknown as Parameters<typeof upsertBudget>[2],
    );

    expect(requireGroupOwner).toHaveBeenCalledWith(
      "owner-1",
      "group-1",
      database,
    );
    expect(result.id).toBe(savedBudget.id);
    expect(budgetValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: savedBudget.id,
        ownerUserId: "owner-1",
        groupId: "group-1",
      }),
    );
  });

  it("rejects a group budget before querying when the actor is not the owner", async () => {
    vi.mocked(requireGroupOwner).mockRejectedValue(new Error("forbidden"));
    const database = { select: vi.fn() };

    await expect(
      upsertBudget(
        "member-1",
        {
          groupId: "group-1",
          name: "Budget du tricount",
          periodType: "year",
          amountFen: 500_000,
          startsAt: new Date("2026-09-01T00:00:00+08:00"),
          endsAt: new Date("2027-08-31T23:59:59+08:00"),
        },
        database as unknown as Parameters<typeof upsertBudget>[2],
      ),
    ).rejects.toThrow("forbidden");
    expect(database.select).not.toHaveBeenCalled();
  });

  it(`rejects more than ${MAX_EXPENSE_SHARES} shares before issuing a D1 query`, async () => {
    const database = { select: vi.fn(), batch: vi.fn() };

    await expect(
      createExpenseWithShares(
        "user-1",
        {
          groupId: "group-1",
          title: "Oversized split",
          amountFen: MAX_EXPENSE_SHARES + 1,
          occurredAt: new Date("2026-09-01T12:00:00+08:00"),
          paidByMemberId: "member-1",
          shares: Array.from({ length: MAX_EXPENSE_SHARES + 1 }, (_, index) => ({
            memberId: `member-${index + 1}`,
            amountFen: 1,
          })),
        },
        database as unknown as Parameters<typeof createExpenseWithShares>[2],
      ),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(requireGroupMembership).not.toHaveBeenCalled();
    expect(database.select).not.toHaveBeenCalled();
    expect(database.batch).not.toHaveBeenCalled();
  });

  it("rejects a group expense outside the group's accounting period", async () => {
    vi.mocked(requireGroupMembership).mockResolvedValue({
      id: "member-1",
      groupId: "group-1",
      userId: "user-1",
      role: "owner",
      status: "active",
    });
    const limit = vi.fn(async () => [
      {
        startsAt: new Date("2026-09-01T00:00:00+08:00"),
        endsAt: new Date("2027-08-31T23:59:59.999+08:00"),
      },
    ]);
    const select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit })),
      })),
    }));
    const database = { select, batch: vi.fn() };

    await expect(
      createExpenseWithShares(
        "user-1",
        {
          groupId: "group-1",
          title: "Too late",
          amountFen: 100,
          occurredAt: new Date("2027-09-01T00:00:00+08:00"),
          paidByMemberId: "member-1",
          shares: [{ memberId: "member-1", amountFen: 100 }],
        },
        database as unknown as Parameters<typeof createExpenseWithShares>[2],
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "The expense date must fall within the group period.",
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(database.batch).not.toHaveBeenCalled();
  });
});
