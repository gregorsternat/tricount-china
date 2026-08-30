import { describe, expect, it } from "vitest";

import {
  DomainValidationError,
  calculateBalances,
  calculateTotalExpenses,
  simplifyDebts,
  splitEvenly,
  validateExactShares,
  type Expense,
  type Participant,
  type ParticipantBalance,
  type Settlement,
} from "./domain";

const participants: Participant[] = [
  { id: "alice", name: "Alice" },
  { id: "bob", name: "Bob" },
  { id: "chen", name: "Chen" },
];

function expense(
  overrides: Partial<Expense> & Pick<Expense, "id" | "amountFen" | "payerId" | "shares">,
): Expense {
  return {
    groupId: "beijing",
    title: overrides.id,
    ...overrides,
  };
}

describe("splitEvenly", () => {
  it("distributes the remainder in beneficiary order without losing a fen", () => {
    expect(splitEvenly(101, ["alice", "bob", "chen"])).toEqual([
      { participantId: "alice", amountFen: 34 },
      { participantId: "bob", amountFen: 34 },
      { participantId: "chen", amountFen: 33 },
    ]);
  });

  it("allows amounts smaller than the number of beneficiaries", () => {
    expect(splitEvenly(2, ["alice", "bob", "chen"])).toEqual([
      { participantId: "alice", amountFen: 1 },
      { participantId: "bob", amountFen: 1 },
      { participantId: "chen", amountFen: 0 },
    ]);
  });

  it("rejects invalid amounts and beneficiary sets", () => {
    expect(() => splitEvenly(-1, ["alice"])).toThrow(DomainValidationError);
    expect(() => splitEvenly(1.5, ["alice"])).toThrow(DomainValidationError);
    expect(() => splitEvenly(100, [])).toThrow(DomainValidationError);
    expect(() => splitEvenly(100, ["alice", "alice"])).toThrow(
      DomainValidationError,
    );
  });
});

describe("validateExactShares", () => {
  it("accepts exact integer-fen shares", () => {
    expect(() =>
      validateExactShares(100, [
        { participantId: "alice", amountFen: 67 },
        { participantId: "bob", amountFen: 33 },
      ]),
    ).not.toThrow();
  });

  it("rejects mismatches, duplicates, negative and fractional shares", () => {
    expect(() =>
      validateExactShares(100, [
        { participantId: "alice", amountFen: 60 },
        { participantId: "bob", amountFen: 30 },
      ]),
    ).toThrow(/does not equal/);

    expect(() =>
      validateExactShares(100, [
        { participantId: "alice", amountFen: 50 },
        { participantId: "alice", amountFen: 50 },
      ]),
    ).toThrow(/duplicate participant/);

    expect(() =>
      validateExactShares(100, [
        { participantId: "alice", amountFen: -1 },
        { participantId: "bob", amountFen: 101 },
      ]),
    ).toThrow(DomainValidationError);

    expect(() =>
      validateExactShares(100, [
        { participantId: "alice", amountFen: 0.5 },
        { participantId: "bob", amountFen: 99.5 },
      ]),
    ).toThrow(DomainValidationError);
  });
});

describe("calculateBalances", () => {
  it("calculates paid minus owed and includes settlements", () => {
    const expenses: Expense[] = [
      expense({
        id: "dinner",
        amountFen: 1_000,
        payerId: "alice",
        shares: [
          { participantId: "alice", amountFen: 334 },
          { participantId: "bob", amountFen: 333 },
          { participantId: "chen", amountFen: 333 },
        ],
      }),
      expense({
        id: "taxi",
        amountFen: 600,
        payerId: "bob",
        shares: [
          { participantId: "alice", amountFen: 300 },
          { participantId: "bob", amountFen: 300 },
        ],
      }),
    ];
    const settlements: Settlement[] = [
      {
        id: "chen-pays-alice",
        groupId: "beijing",
        fromParticipantId: "chen",
        toParticipantId: "alice",
        amountFen: 200,
      },
    ];

    expect(calculateBalances(participants, expenses, settlements)).toEqual([
      { participantId: "alice", balanceFen: 166 },
      { participantId: "bob", balanceFen: -33 },
      { participantId: "chen", balanceFen: -133 },
    ]);
  });

  it("does not mutate the inputs", () => {
    const members = Object.freeze(
      participants.map((participant) => Object.freeze({ ...participant })),
    );
    const shares = Object.freeze([
      Object.freeze({ participantId: "alice", amountFen: 50 }),
      Object.freeze({ participantId: "bob", amountFen: 50 }),
    ]);
    const expenses = Object.freeze([
      Object.freeze(
        expense({ id: "tea", amountFen: 100, payerId: "alice", shares }),
      ),
    ]);

    expect(() => calculateBalances(members, expenses)).not.toThrow();
  });

  it("rejects unknown participants and invalid exact shares", () => {
    expect(() =>
      calculateBalances(participants, [
        expense({
          id: "unknown-payer",
          amountFen: 100,
          payerId: "nobody",
          shares: [{ participantId: "alice", amountFen: 100 }],
        }),
      ]),
    ).toThrow(/unknown participant nobody/);

    expect(() =>
      calculateBalances(participants, [
        expense({
          id: "bad-shares",
          amountFen: 100,
          payerId: "alice",
          shares: [{ participantId: "alice", amountFen: 99 }],
        }),
      ]),
    ).toThrow(/does not equal/);
  });
});

describe("simplifyDebts", () => {
  it("greedily matches the largest debtors and creditors", () => {
    const balances: ParticipantBalance[] = [
      { participantId: "dan", balanceFen: 400 },
      { participantId: "bob", balanceFen: -300 },
      { participantId: "alice", balanceFen: -700 },
      { participantId: "chen", balanceFen: 600 },
    ];

    expect(simplifyDebts(balances)).toEqual([
      {
        fromParticipantId: "alice",
        toParticipantId: "chen",
        amountFen: 600,
      },
      {
        fromParticipantId: "alice",
        toParticipantId: "dan",
        amountFen: 100,
      },
      {
        fromParticipantId: "bob",
        toParticipantId: "dan",
        amountFen: 300,
      },
    ]);
  });

  it("uses participant ids as a stable tie-breaker", () => {
    const balances: ParticipantBalance[] = [
      { participantId: "d", balanceFen: 500 },
      { participantId: "b", balanceFen: -500 },
      { participantId: "c", balanceFen: 500 },
      { participantId: "a", balanceFen: -500 },
    ];

    expect(simplifyDebts(balances)).toEqual([
      { fromParticipantId: "a", toParticipantId: "c", amountFen: 500 },
      { fromParticipantId: "b", toParticipantId: "d", amountFen: 500 },
    ]);
  });

  it("rejects unbalanced or invalid input", () => {
    expect(() =>
      simplifyDebts([
        { participantId: "alice", balanceFen: -10 },
        { participantId: "bob", balanceFen: 9 },
      ]),
    ).toThrow(/must be zero/);

    expect(() =>
      simplifyDebts([
        { participantId: "alice", balanceFen: -10 },
        { participantId: "alice", balanceFen: 10 },
      ]),
    ).toThrow(/duplicate participant/);
  });
});

describe("calculateTotalExpenses", () => {
  it("adds expense amounts and excludes no value through rounding", () => {
    const expenses: Expense[] = [
      expense({
        id: "one",
        amountFen: 100,
        payerId: "alice",
        shares: [{ participantId: "alice", amountFen: 100 }],
      }),
      expense({
        id: "two",
        amountFen: 251,
        payerId: "bob",
        shares: [{ participantId: "bob", amountFen: 251 }],
      }),
    ];

    expect(calculateTotalExpenses(expenses)).toBe(351);
    expect(calculateTotalExpenses([])).toBe(0);
  });

  it("rejects totals outside the safe integer range", () => {
    const expenses: Expense[] = [
      expense({
        id: "large",
        amountFen: Number.MAX_SAFE_INTEGER,
        payerId: "alice",
        shares: [{ participantId: "alice", amountFen: Number.MAX_SAFE_INTEGER }],
      }),
      expense({
        id: "overflow",
        amountFen: 1,
        payerId: "alice",
        shares: [{ participantId: "alice", amountFen: 1 }],
      }),
    ];

    expect(() => calculateTotalExpenses(expenses)).toThrow(/safe integer range/);
  });
});
