import type {
  WalletMergeResult,
  WalletTransaction,
  WalletTransactionStatus,
} from "./types";

const STATUS_PRECEDENCE: Readonly<Record<WalletTransactionStatus, number>> = {
  unknown: 0,
  pending: 1,
  failed: 2,
  cancelled: 2,
  completed: 3,
  partially_refunded: 4,
  refunded: 5,
};

function identityKey(transaction: WalletTransaction): string {
  return `${transaction.source}:${transaction.sourceId}`;
}

function fingerprintKey(transaction: WalletTransaction): string {
  return `${transaction.source}:${transaction.fingerprint}`;
}

function mergeMatchedTransaction(
  existing: WalletTransaction,
  incoming: WalletTransaction,
): WalletTransaction {
  const incomingIsAtLeastAsFinal =
    STATUS_PRECEDENCE[incoming.status] >= STATUS_PRECEDENCE[existing.status];
  const primary = incomingIsAtLeastAsFinal ? incoming : existing;
  const secondary = incomingIsAtLeastAsFinal ? existing : incoming;
  const refundAmountFen = Math.max(
    existing.refundAmountFen ?? 0,
    incoming.refundAmountFen ?? 0,
  );

  return {
    ...secondary,
    ...primary,
    // Never rotate a previously persisted key when an export later gains an ID.
    sourceId: existing.sourceId,
    fingerprint: existing.fingerprint,
    externalTransactionId:
      primary.externalTransactionId ?? secondary.externalTransactionId,
    merchantOrderId: primary.merchantOrderId ?? secondary.merchantOrderId,
    status: incomingIsAtLeastAsFinal ? incoming.status : existing.status,
    isRefund: existing.isRefund || incoming.isRefund,
    refundAmountFen: refundAmountFen > 0 ? refundAmountFen : undefined,
    relatedTransactionId:
      primary.relatedTransactionId ?? secondary.relatedTransactionId,
    counterparty: primary.counterparty ?? secondary.counterparty,
    description: primary.description ?? secondary.description,
    categoryRaw: primary.categoryRaw ?? secondary.categoryRaw,
    paymentMethod: primary.paymentMethod ?? secondary.paymentMethod,
    note: primary.note ?? secondary.note,
    rawData: incomingIsAtLeastAsFinal
      ? { ...existing.rawData, ...incoming.rawData }
      : { ...incoming.rawData, ...existing.rawData },
  };
}

function transactionsEqual(
  left: WalletTransaction,
  right: WalletTransaction,
): boolean {
  return (
    JSON.stringify({ ...left, rawData: undefined }) ===
    JSON.stringify({ ...right, rawData: undefined })
  );
}

/**
 * Reconciles a new import with persisted transactions. Exact repeats are
 * ignored, later lifecycle states update in place, and an ID collision with
 * different immutable fields is surfaced instead of silently overwriting data.
 */
export function mergeWalletTransactions(
  existing: readonly WalletTransaction[],
  incoming: readonly WalletTransaction[],
): WalletMergeResult {
  const transactions = [...existing];
  const inserted: WalletTransaction[] = [];
  const updated: WalletMergeResult["updated"][number][] = [];
  const duplicates: WalletTransaction[] = [];
  const conflicts: WalletMergeResult["conflicts"][number][] = [];
  const byIdentity = new Map<string, number>();
  const byFingerprint = new Map<string, number>();

  transactions.forEach((transaction, index) => {
    byIdentity.set(identityKey(transaction), index);
    byFingerprint.set(fingerprintKey(transaction), index);
  });

  for (const candidate of incoming) {
    const sourceMatchIndex = byIdentity.get(identityKey(candidate));

    if (sourceMatchIndex !== undefined) {
      const current = transactions[sourceMatchIndex];
      if (current.fingerprint !== candidate.fingerprint) {
        conflicts.push({
          existing: current,
          incoming: candidate,
          reason: "SOURCE_ID_COLLISION",
        });
        continue;
      }

      const merged = mergeMatchedTransaction(current, candidate);
      if (transactionsEqual(current, merged)) {
        duplicates.push(candidate);
      } else {
        transactions[sourceMatchIndex] = merged;
        updated.push({ previous: current, current: merged });
      }
      continue;
    }

    const fingerprintMatchIndex = byFingerprint.get(fingerprintKey(candidate));
    if (fingerprintMatchIndex !== undefined) {
      const current = transactions[fingerprintMatchIndex];
      const bothHaveDifferentProviderIds =
        current.externalTransactionId !== undefined &&
        candidate.externalTransactionId !== undefined &&
        current.externalTransactionId !== candidate.externalTransactionId;

      // Two genuine purchases can have otherwise identical fields in the same
      // second. A distinct provider ID is stronger evidence than a fingerprint.
      if (!bothHaveDifferentProviderIds) {
        const merged = mergeMatchedTransaction(current, candidate);
        if (transactionsEqual(current, merged)) {
          duplicates.push(candidate);
        } else {
          transactions[fingerprintMatchIndex] = merged;
          updated.push({ previous: current, current: merged });
        }
        byIdentity.set(identityKey(candidate), fingerprintMatchIndex);
        continue;
      }
    }

    const newIndex = transactions.length;
    transactions.push(candidate);
    inserted.push(candidate);
    byIdentity.set(identityKey(candidate), newIndex);
    byFingerprint.set(fingerprintKey(candidate), newIndex);
  }

  return { transactions, inserted, updated, duplicates, conflicts };
}
