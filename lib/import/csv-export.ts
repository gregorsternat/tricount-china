import Papa from "papaparse";

import type { WalletTransaction } from "./types";

const FORMULA_PREFIX = /^[\u0000-\u0020]*[=+\-@]/u;

/** Prevents spreadsheet software from executing user/provider text as a formula. */
export function neutralizeSpreadsheetFormula(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

/** A safe, normalized CSV for user-controlled downloads or support exports. */
export function exportWalletTransactionsCsv(
  transactions: readonly WalletTransaction[],
): string {
  const rows = transactions.map((transaction) => ({
    provider: transaction.source,
    sourceId: transaction.sourceId,
    occurredAt: transaction.occurredAt,
    amountFen: transaction.amountFen,
    currency: transaction.currency,
    direction: transaction.direction,
    status: transaction.status,
    kind: transaction.kind,
    counterparty: neutralizeSpreadsheetFormula(transaction.counterparty ?? ""),
    description: neutralizeSpreadsheetFormula(transaction.description ?? ""),
    category: neutralizeSpreadsheetFormula(transaction.categoryRaw ?? ""),
    paymentMethod: neutralizeSpreadsheetFormula(transaction.paymentMethod ?? ""),
    note: neutralizeSpreadsheetFormula(transaction.note ?? ""),
  }));

  return Papa.unparse(rows, { newline: "\r\n" });
}
