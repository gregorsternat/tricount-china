export type ParticipantId = string;
export type Fen = number;

export interface Group {
  readonly id: string;
  readonly name: string;
  readonly participantIds: readonly ParticipantId[];
}

export interface Participant {
  readonly id: ParticipantId;
  readonly name: string;
}

export interface ExpenseShare {
  readonly participantId: ParticipantId;
  readonly amountFen: Fen;
}

export interface Expense {
  readonly id: string;
  readonly groupId: string;
  readonly title: string;
  readonly amountFen: Fen;
  readonly payerId: ParticipantId;
  readonly shares: readonly ExpenseShare[];
  readonly occurredAt?: string;
}

export interface Settlement {
  readonly id: string;
  readonly groupId: string;
  readonly fromParticipantId: ParticipantId;
  readonly toParticipantId: ParticipantId;
  readonly amountFen: Fen;
  readonly settledAt?: string;
}

export interface ParticipantBalance {
  readonly participantId: ParticipantId;
  /** Positive means the group owes this participant; negative means they owe. */
  readonly balanceFen: Fen;
}

export interface SimplifiedDebt {
  readonly fromParticipantId: ParticipantId;
  readonly toParticipantId: ParticipantId;
  readonly amountFen: Fen;
}

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}

function assertParticipantId(id: string, label: string): void {
  if (typeof id !== "string" || id.length === 0 || id !== id.trim()) {
    throw new DomainValidationError(`${label} must be a non-empty, trimmed string`);
  }
}

function assertFen(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainValidationError(
      `${label} must be a non-negative safe integer amount in fen`,
    );
  }
}

function assertSignedFen(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new DomainValidationError(`${label} must be a safe integer amount in fen`);
  }
}

function checkedAdd(left: number, right: number, label: string): number {
  const result = left + right;

  if (!Number.isSafeInteger(result)) {
    throw new DomainValidationError(`${label} exceeds the safe integer range`);
  }

  return result;
}

function assertUniqueParticipantIds(
  participantIds: readonly ParticipantId[],
  label: string,
): void {
  const seen = new Set<ParticipantId>();

  participantIds.forEach((participantId, index) => {
    assertParticipantId(participantId, `${label}[${index}]`);

    if (seen.has(participantId)) {
      throw new DomainValidationError(
        `${label} contains duplicate participant ${participantId}`,
      );
    }

    seen.add(participantId);
  });
}

/**
 * Splits an amount without losing a fen. Any remainder is assigned, one fen at
 * a time, following the beneficiary order supplied by the caller.
 */
export function splitEvenly(
  amountFen: Fen,
  beneficiaryIds: readonly ParticipantId[],
): ExpenseShare[] {
  assertFen(amountFen, "amountFen");

  if (beneficiaryIds.length === 0) {
    throw new DomainValidationError("at least one beneficiary is required");
  }

  assertUniqueParticipantIds(beneficiaryIds, "beneficiaryIds");

  const baseShare = Math.floor(amountFen / beneficiaryIds.length);
  const remainder = amountFen % beneficiaryIds.length;

  return beneficiaryIds.map((participantId, index) => ({
    participantId,
    amountFen: baseShare + (index < remainder ? 1 : 0),
  }));
}

/**
 * Asserts that exact shares are usable and add up to the expense amount.
 * Zero-fen shares are allowed so very small expenses can still be split.
 */
export function validateExactShares(
  amountFen: Fen,
  shares: readonly ExpenseShare[],
): void {
  assertFen(amountFen, "amountFen");

  if (shares.length === 0) {
    throw new DomainValidationError("at least one expense share is required");
  }

  const seen = new Set<ParticipantId>();
  let sharesTotalFen = 0;

  shares.forEach((share, index) => {
    assertParticipantId(share.participantId, `shares[${index}].participantId`);
    assertFen(share.amountFen, `shares[${index}].amountFen`);

    if (seen.has(share.participantId)) {
      throw new DomainValidationError(
        `shares contains duplicate participant ${share.participantId}`,
      );
    }

    seen.add(share.participantId);
    sharesTotalFen = checkedAdd(
      sharesTotalFen,
      share.amountFen,
      "expense shares total",
    );
  });

  if (sharesTotalFen !== amountFen) {
    throw new DomainValidationError(
      `expense shares total ${sharesTotalFen} fen does not equal ${amountFen} fen`,
    );
  }
}

/**
 * Calculates paid minus owed for each participant. A settlement from A to B
 * increases A's balance and decreases B's balance, cancelling the debt that
 * prompted the transfer.
 */
export function calculateBalances(
  participants: readonly Participant[],
  expenses: readonly Expense[],
  settlements: readonly Settlement[] = [],
): ParticipantBalance[] {
  assertUniqueParticipantIds(
    participants.map((participant) => participant.id),
    "participants",
  );

  const balances = new Map<ParticipantId, number>(
    participants.map((participant) => [participant.id, 0]),
  );

  const adjustBalance = (
    participantId: ParticipantId,
    deltaFen: number,
    context: string,
  ): void => {
    if (!balances.has(participantId)) {
      throw new DomainValidationError(
        `${context} references unknown participant ${participantId}`,
      );
    }

    balances.set(
      participantId,
      checkedAdd(
        balances.get(participantId) ?? 0,
        deltaFen,
        `balance for participant ${participantId}`,
      ),
    );
  };

  expenses.forEach((expense) => {
    assertFen(expense.amountFen, `expense ${expense.id}.amountFen`);
    assertParticipantId(expense.payerId, `expense ${expense.id}.payerId`);
    validateExactShares(expense.amountFen, expense.shares);

    adjustBalance(expense.payerId, expense.amountFen, `expense ${expense.id}`);

    expense.shares.forEach((share) => {
      adjustBalance(
        share.participantId,
        -share.amountFen,
        `expense ${expense.id}`,
      );
    });
  });

  settlements.forEach((settlement) => {
    assertFen(settlement.amountFen, `settlement ${settlement.id}.amountFen`);
    assertParticipantId(
      settlement.fromParticipantId,
      `settlement ${settlement.id}.fromParticipantId`,
    );
    assertParticipantId(
      settlement.toParticipantId,
      `settlement ${settlement.id}.toParticipantId`,
    );

    if (settlement.fromParticipantId === settlement.toParticipantId) {
      throw new DomainValidationError(
        `settlement ${settlement.id} cannot be made to the same participant`,
      );
    }

    adjustBalance(
      settlement.fromParticipantId,
      settlement.amountFen,
      `settlement ${settlement.id}`,
    );
    adjustBalance(
      settlement.toParticipantId,
      -settlement.amountFen,
      `settlement ${settlement.id}`,
    );
  });

  const result = participants.map((participant) => ({
    participantId: participant.id,
    balanceFen: balances.get(participant.id) ?? 0,
  }));

  const netBalanceFen = result.reduce(
    (total, balance) =>
      checkedAdd(total, balance.balanceFen, "participants' net balance"),
    0,
  );

  if (netBalanceFen !== 0) {
    throw new DomainValidationError(
      `participants' net balance must be zero, got ${netBalanceFen} fen`,
    );
  }

  return result;
}

function compareParticipantIds(left: ParticipantId, right: ParticipantId): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Greedily matches the largest debtors and creditors. The result is stable for
 * the same balances regardless of input order and never contains zero-value
 * transfers.
 */
export function simplifyDebts(
  balances: readonly ParticipantBalance[],
): SimplifiedDebt[] {
  assertUniqueParticipantIds(
    balances.map((balance) => balance.participantId),
    "balances",
  );

  let netBalanceFen = 0;

  balances.forEach((balance, index) => {
    assertSignedFen(balance.balanceFen, `balances[${index}].balanceFen`);
    netBalanceFen = checkedAdd(
      netBalanceFen,
      balance.balanceFen,
      "participants' net balance",
    );
  });

  if (netBalanceFen !== 0) {
    throw new DomainValidationError(
      `participants' net balance must be zero, got ${netBalanceFen} fen`,
    );
  }

  const byLargestAmountThenId = (
    left: { participantId: ParticipantId; amountFen: number },
    right: { participantId: ParticipantId; amountFen: number },
  ): number => {
    if (left.amountFen !== right.amountFen) {
      return left.amountFen > right.amountFen ? -1 : 1;
    }

    return compareParticipantIds(left.participantId, right.participantId);
  };

  const debtors = balances
    .filter((balance) => balance.balanceFen < 0)
    .map((balance) => ({
      participantId: balance.participantId,
      amountFen: -balance.balanceFen,
    }))
    .sort(byLargestAmountThenId);

  const creditors = balances
    .filter((balance) => balance.balanceFen > 0)
    .map((balance) => ({
      participantId: balance.participantId,
      amountFen: balance.balanceFen,
    }))
    .sort(byLargestAmountThenId);

  const debts: SimplifiedDebt[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountFen = Math.min(debtor.amountFen, creditor.amountFen);

    debts.push({
      fromParticipantId: debtor.participantId,
      toParticipantId: creditor.participantId,
      amountFen,
    });

    debtor.amountFen -= amountFen;
    creditor.amountFen -= amountFen;

    if (debtor.amountFen === 0) debtorIndex += 1;
    if (creditor.amountFen === 0) creditorIndex += 1;
  }

  if (debtorIndex !== debtors.length || creditorIndex !== creditors.length) {
    throw new DomainValidationError("could not fully simplify participant debts");
  }

  return debts;
}

export function calculateTotalExpenses(expenses: readonly Expense[]): Fen {
  return expenses.reduce((totalFen, expense) => {
    assertFen(expense.amountFen, `expense ${expense.id}.amountFen`);
    return checkedAdd(totalFen, expense.amountFen, "expenses total");
  }, 0);
}
