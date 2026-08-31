export const WALLET_IMPORT_PARSER_VERSION = "wallet-import/1.0.0" as const;

export type WalletProvider = "wechat" | "alipay";
export type WalletFileFormat = "csv" | "xlsx";
export type WalletTextEncoding = "utf-8" | "gb18030";

export type WalletTransactionDirection =
  | "outflow"
  | "inflow"
  | "neutral"
  | "unknown";

export type WalletTransactionStatus =
  | "completed"
  | "pending"
  | "failed"
  | "cancelled"
  | "partially_refunded"
  | "refunded"
  | "unknown";

export type WalletTransactionKind =
  | "payment"
  | "transfer"
  | "refund"
  | "top_up"
  | "withdrawal"
  | "other";

/**
 * A provider-neutral wallet transaction. Money is always represented as an
 * integer number of fen; the direction carries the sign.
 */
export interface WalletTransaction {
  readonly source: WalletProvider;
  /** Stable, provider-scoped and pseudonymous identifier suitable for a DB key. */
  readonly sourceId: string;
  /** The provider identifier is retained for support/reconciliation, never logged. */
  readonly externalTransactionId?: string;
  readonly merchantOrderId?: string;
  /** SHA-256 of stable normalized fields. It intentionally excludes mutable status. */
  readonly fingerprint: string;
  readonly parserVersion: typeof WALLET_IMPORT_PARSER_VERSION;
  readonly occurredAt: string;
  readonly timezone: "Asia/Shanghai";
  readonly amountFen: number;
  readonly currency: "CNY";
  readonly direction: WalletTransactionDirection;
  readonly status: WalletTransactionStatus;
  readonly kind: WalletTransactionKind;
  readonly isRefund: boolean;
  readonly refundAmountFen?: number;
  readonly relatedTransactionId?: string;
  readonly counterparty?: string;
  readonly description?: string;
  readonly categoryRaw?: string;
  readonly paymentMethod?: string;
  readonly note?: string;
  /** Original columns for audit/debugging. Values are never interpolated into errors. */
  readonly rawData: Readonly<Record<string, string>>;
}

export type WalletImportIssueCode =
  | "INVALID_DATE"
  | "INVALID_AMOUNT"
  | "MISSING_DATE"
  | "MISSING_AMOUNT"
  | "UNKNOWN_DIRECTION"
  | "UNKNOWN_STATUS";

export interface WalletImportIssue {
  /** One-based row number in the uploaded document. */
  readonly row: number;
  readonly severity: "warning" | "error";
  readonly code: WalletImportIssueCode;
  readonly message: string;
}

export interface WalletImportResult {
  readonly provider: WalletProvider;
  readonly format: WalletFileFormat;
  readonly encoding?: WalletTextEncoding;
  readonly headerRow: number;
  readonly rowsRead: number;
  readonly rowsSkipped: number;
  readonly transactions: readonly WalletTransaction[];
  readonly issues: readonly WalletImportIssue[];
}

export interface InMemoryWalletFile {
  readonly name: string;
  readonly type?: string;
  readonly data: ArrayBuffer | Uint8Array;
}

export interface ArrayBufferWalletFile {
  readonly name: string;
  readonly type?: string;
  readonly size?: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type WalletImportInput = InMemoryWalletFile | ArrayBufferWalletFile;

export type FingerprintHasher = (value: string) => Promise<string>;

export interface WalletImportOptions {
  /** Optional when the filename/content contains a recognizable provider marker. */
  readonly provider?: WalletProvider;
  readonly maxFileBytes?: number;
  readonly maxRows?: number;
  /** Dependency injection hook for deterministic isolated tests. */
  readonly hasher?: FingerprintHasher;
}

export interface WalletTransactionUpdate {
  readonly previous: WalletTransaction;
  readonly current: WalletTransaction;
}

export interface WalletTransactionConflict {
  readonly existing: WalletTransaction;
  readonly incoming: WalletTransaction;
  readonly reason: "SOURCE_ID_COLLISION";
}

export interface WalletMergeResult {
  readonly transactions: readonly WalletTransaction[];
  readonly inserted: readonly WalletTransaction[];
  readonly updated: readonly WalletTransactionUpdate[];
  readonly duplicates: readonly WalletTransaction[];
  readonly conflicts: readonly WalletTransactionConflict[];
}
