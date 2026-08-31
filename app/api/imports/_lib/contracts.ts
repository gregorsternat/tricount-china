import { z } from "zod";

import {
  WALLET_IMPORT_PARSER_VERSION,
  type WalletImportIssue,
  type WalletProvider,
  type WalletTransaction,
} from "../../../../lib/import";

export const IMPORT_PREVIEW_TTL_MS = 15 * 60 * 1_000;
export const MAX_IMPORT_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_MULTIPART_BODY_BYTES = MAX_IMPORT_FILE_BYTES + 1024 * 1024;
export const MAX_PREVIEW_STORAGE_BYTES = 1_750_000;

const providerSchema = z.enum(["wechat", "alipay"]);
const directionSchema = z.enum(["outflow", "inflow", "neutral", "unknown"]);
const statusSchema = z.enum([
  "completed",
  "pending",
  "failed",
  "cancelled",
  "partially_refunded",
  "refunded",
  "unknown",
]);
const kindSchema = z.enum([
  "payment",
  "transfer",
  "refund",
  "top_up",
  "withdrawal",
  "other",
]);

const safeFenSchema = z.number().int().nonnegative().safe();

export const walletTransactionSchema = z
  .object({
    source: providerSchema,
    sourceId: z.string().min(1).max(128),
    externalTransactionId: z.string().max(1_024).optional(),
    merchantOrderId: z.string().max(1_024).optional(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    parserVersion: z.literal(WALLET_IMPORT_PARSER_VERSION),
    occurredAt: z.string().datetime({ offset: true }),
    timezone: z.literal("Asia/Shanghai"),
    amountFen: safeFenSchema,
    currency: z.literal("CNY"),
    direction: directionSchema,
    status: statusSchema,
    kind: kindSchema,
    isRefund: z.boolean(),
    refundAmountFen: safeFenSchema.optional(),
    relatedTransactionId: z.string().max(1_024).optional(),
    counterparty: z.string().max(4_096).optional(),
    description: z.string().max(4_096).optional(),
    categoryRaw: z.string().max(4_096).optional(),
    paymentMethod: z.string().max(4_096).optional(),
    note: z.string().max(8_192).optional(),
    rawData: z.record(z.string().max(512), z.string().max(32_768)),
  })
  .strict();

export const previewSummarySchema = z
  .object({
    accepted: z.number().int().nonnegative().safe(),
    duplicates: z.number().int().nonnegative().safe(),
    rejected: z.number().int().nonnegative().safe(),
    totalFen: safeFenSchema,
  })
  .strict();

const stagedActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("insert"),
      transaction: walletTransactionSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      existingId: z.string().min(1).max(128),
      transaction: walletTransactionSchema,
    })
    .strict(),
]);

export const stagedPreviewSchema = z
  .object({
    version: z.literal(1),
    summary: previewSummarySchema,
    actions: z.array(stagedActionSchema).max(25_000),
  })
  .strict();

export type PreviewSummary = z.infer<typeof previewSummarySchema>;
export type StagedAction = z.infer<typeof stagedActionSchema>;
export type StagedPreview = z.infer<typeof stagedPreviewSchema>;

export interface AuthenticatedImportUser {
  readonly id: string;
}

export interface PersistedWalletTransaction {
  readonly id: string;
  readonly transaction: WalletTransaction;
}

export interface ImportBatchRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly provider: WalletProvider;
  readonly sourceFilename: string;
  readonly sourceFileHash: string;
  readonly fileSizeBytes: number | null;
  readonly status: "pending" | "processing" | "completed" | "failed" | "rolled_back";
  readonly totalRows: number;
  readonly importedRows: number;
  readonly duplicateRows: number;
  readonly skippedRows: number;
  readonly errorRows: number;
  readonly totalFen: number;
  readonly previewPayloadJson: string | null;
  readonly previewExpiresAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
}

export interface SavePreviewInput {
  readonly ownerUserId: string;
  readonly provider: WalletProvider;
  readonly sourceFilename: string;
  readonly sourceFileHash: string;
  readonly fileSizeBytes: number;
  readonly periodStart: Date | null;
  readonly periodEnd: Date | null;
  readonly totalRows: number;
  readonly duplicateRows: number;
  readonly skippedRows: number;
  readonly errorRows: number;
  readonly errors: readonly WalletImportIssue[];
  readonly summary: PreviewSummary;
  readonly previewPayloadJson: string;
  readonly previewExpiresAt: Date;
  readonly startedAt: Date;
}

export interface ImportHistoryItem {
  readonly id: string;
  readonly provider: WalletProvider;
  readonly sourceFilename: string;
  readonly status: ImportBatchRecord["status"];
  readonly totalRows: number;
  readonly importedRows: number;
  readonly duplicateRows: number;
  readonly skippedRows: number;
  readonly errorRows: number;
  readonly totalFen: number;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export interface ImportRepository {
  purgeExpiredPreviews(ownerUserId: string, expiredAt: Date): Promise<number>;
  findBatchByFileHash(
    ownerUserId: string,
    provider: WalletProvider,
    sourceFileHash: string,
  ): Promise<ImportBatchRecord | null>;
  savePreview(
    input: SavePreviewInput,
    existingBatchId?: string,
  ): Promise<ImportBatchRecord>;
  listWalletTransactions(
    ownerUserId: string,
    provider: WalletProvider,
  ): Promise<readonly PersistedWalletTransaction[]>;
  findBatchById(
    ownerUserId: string,
    batchId: string,
  ): Promise<ImportBatchRecord | null>;
  completeBatch(
    ownerUserId: string,
    batchId: string,
    preview: StagedPreview,
    completedAt: Date,
  ): Promise<number>;
  expireBatch(ownerUserId: string, batchId: string, expiredAt: Date): Promise<void>;
  listHistory(
    ownerUserId: string,
    limit: number,
  ): Promise<readonly ImportHistoryItem[]>;
}

export interface ImportApiDependencies {
  readonly repository: ImportRepository;
  readonly requireSameOrigin: (request: Request) => void;
  readonly requireUser: (
    requestHeaders: Headers,
  ) => Promise<AuthenticatedImportUser>;
  readonly now?: () => Date;
}
