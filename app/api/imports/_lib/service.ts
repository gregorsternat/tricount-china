import { z } from "zod";

import {
  mergeWalletTransactions,
  parseWalletExport,
  type WalletProvider,
  type WalletTransaction,
} from "../../../../lib/import";
import { HttpError } from "../../../../lib/server/errors";

import {
  IMPORT_PREVIEW_TTL_MS,
  MAX_IMPORT_FILE_BYTES,
  MAX_MULTIPART_BODY_BYTES,
  type ImportApiDependencies,
  type PersistedWalletTransaction,
  type PreviewSummary,
  type StagedAction,
  type StagedPreview,
} from "./contracts";
import { decodePreviewPayload, encodePreviewPayload } from "./preview-payload";

const providerSchema = z.enum(["wechat", "alipay"]);
const MAX_RAW_DATA_BYTES = 16 * 1024;

interface MultipartUpload {
  readonly provider: WalletProvider;
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

function privateJson(value: unknown): Response {
  return Response.json(value, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function contentLength(request: Request): number | null {
  const value = request.headers.get("content-length");
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function importTooLarge(): HttpError {
  return new HttpError(
    413,
    "IMPORT_FILE_TOO_LARGE",
    "The upload exceeds the 12 MB import limit.",
  );
}

async function readBoundedRequestBody(
  request: Request,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      if (totalBytes + value.byteLength > MAX_MULTIPART_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw importTooLarge();
      }
      totalBytes += value.byteLength;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    value !== null &&
    typeof value !== "string" &&
    typeof value.arrayBuffer === "function" &&
    typeof value.name === "string" &&
    typeof value.size === "number"
  );
}

function safeFilename(value: string): string {
  const basename = value
    .normalize("NFKC")
    .split(/[\\/]/u)
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim();
  return (basename || "wallet-export").slice(0, 255);
}

async function readMultipartUpload(request: Request): Promise<MultipartUpload> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
    throw new HttpError(
      415,
      "MULTIPART_REQUIRED",
      "Upload the statement as multipart form data with source and file fields.",
    );
  }

  const declaredLength = contentLength(request);
  if (declaredLength !== null && declaredLength > MAX_MULTIPART_BODY_BYTES) {
    throw importTooLarge();
  }

  let formData: FormData;
  try {
    const body = await readBoundedRequestBody(request);
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const boundedRequest = new Request(request.url, {
      method: request.method,
      headers,
      body,
    });
    formData = await boundedRequest.formData();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "INVALID_MULTIPART", "The multipart upload is invalid.");
  }

  const keys = [...formData.keys()];
  if (
    formData.getAll("source").length !== 1 ||
    formData.getAll("file").length !== 1 ||
    keys.some((key) => key !== "source" && key !== "file")
  ) {
    throw new HttpError(
      400,
      "INVALID_IMPORT_FIELDS",
      "Provide exactly one source field and one file field.",
    );
  }

  const providerValue = formData.get("source");
  const file = formData.get("file");
  const provider = providerSchema.safeParse(providerValue);
  if (!provider.success) {
    throw new HttpError(
      400,
      "INVALID_IMPORT_SOURCE",
      "The source must be either wechat or alipay.",
    );
  }
  if (!isUploadedFile(file)) {
    throw new HttpError(400, "IMPORT_FILE_REQUIRED", "A statement file is required.");
  }
  if (file.size <= 0) {
    throw new HttpError(400, "EMPTY_IMPORT_FILE", "The selected statement file is empty.");
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new HttpError(
      413,
      "IMPORT_FILE_TOO_LARGE",
      "The statement file exceeds the 12 MB import limit.",
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new HttpError(
      413,
      "IMPORT_FILE_TOO_LARGE",
      "The statement file exceeds the 12 MB import limit.",
    );
  }

  return {
    provider: provider.data,
    fileName: safeFilename(file.name),
    mimeType: file.type,
    bytes,
  };
}

async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function truncate(value: string | undefined, length: number): string | undefined {
  if (value === undefined) return undefined;
  return Array.from(value).slice(0, length).join("");
}

function boundedExternalId(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.from(value).length <= 1_024 ? value : undefined;
}

function compactRawData(
  rawData: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const compact: Record<string, string> = {};
  const encoder = new TextEncoder();

  for (const [rawKey, rawValue] of Object.entries(rawData).slice(0, 128)) {
    const key = truncate(rawKey, 512) ?? "";
    const value = truncate(rawValue, 4_096) ?? "";
    const candidate = { ...compact, [key]: value };
    if (encoder.encode(JSON.stringify(candidate)).byteLength > MAX_RAW_DATA_BYTES) {
      break;
    }
    compact[key] = value;
  }

  return compact;
}

function compactTransaction(transaction: WalletTransaction): WalletTransaction {
  return {
    ...transaction,
    // Dropping an implausibly long external ID is safer than truncating it into
    // a collision against the database's unique provider-ID constraint.
    externalTransactionId: boundedExternalId(transaction.externalTransactionId),
    merchantOrderId: truncate(transaction.merchantOrderId, 1_024),
    relatedTransactionId: truncate(transaction.relatedTransactionId, 1_024),
    counterparty: truncate(transaction.counterparty, 4_096),
    description: truncate(transaction.description, 4_096),
    categoryRaw: truncate(transaction.categoryRaw, 4_096),
    paymentMethod: truncate(transaction.paymentMethod, 4_096),
    note: truncate(transaction.note, 8_192),
    rawData: compactRawData(transaction.rawData),
  };
}

function transactionKey(transaction: WalletTransaction): string {
  return `${transaction.source}:${transaction.sourceId}`;
}

function buildStagedActions(
  persisted: readonly PersistedWalletTransaction[],
  parsed: readonly WalletTransaction[],
): {
  readonly actions: readonly StagedAction[];
  readonly duplicates: number;
  readonly conflicts: number;
} {
  const persistedTransactions = persisted.map(({ transaction }) => transaction);
  const persistedIds = new Map(
    persisted.map(({ id, transaction }) => [transactionKey(transaction), id]),
  );
  const merged = mergeWalletTransactions(persistedTransactions, parsed);
  const finalByKey = new Map(
    merged.transactions.map((transaction) => [transactionKey(transaction), transaction]),
  );
  const actions = new Map<string, StagedAction>();

  for (const inserted of merged.inserted) {
    const final = finalByKey.get(transactionKey(inserted)) ?? inserted;
    actions.set(transactionKey(final), {
      action: "insert",
      transaction: compactTransaction(final),
    });
  }

  for (const update of merged.updated) {
    const key = transactionKey(update.current);
    const existingId = persistedIds.get(key);
    if (!existingId || actions.has(key)) continue;
    const final = finalByKey.get(key) ?? update.current;
    actions.set(key, {
      action: "update",
      existingId,
      transaction: compactTransaction(final),
    });
  }

  return {
    actions: [...actions.values()],
    duplicates: merged.duplicates.length,
    conflicts: merged.conflicts.length,
  };
}

function totalFen(actions: readonly StagedAction[]): number {
  let total = 0;
  for (const { transaction } of actions) {
    total += transaction.amountFen;
    if (!Number.isSafeInteger(total)) {
      throw new HttpError(
        422,
        "IMPORT_TOTAL_OVERFLOW",
        "The imported amount total exceeds the supported range.",
      );
    }
  }
  return total;
}

function period(actions: readonly StagedAction[]): {
  readonly start: Date | null;
  readonly end: Date | null;
} {
  const timestamps = actions
    .map(({ transaction }) => new Date(transaction.occurredAt))
    .filter((value) => Number.isFinite(value.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());
  return {
    start: timestamps[0] ?? null,
    end: timestamps.at(-1) ?? null,
  };
}

function batchIdIsValid(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/u.test(value);
}

export async function handleImportPreview(
  request: Request,
  dependencies: ImportApiDependencies,
): Promise<Response> {
  dependencies.requireSameOrigin(request);
  const user = await dependencies.requireUser(request.headers);
  const upload = await readMultipartUpload(request);
  const now = (dependencies.now ?? (() => new Date()))();
  await dependencies.repository.purgeExpiredPreviews(user.id, now);
  const [sourceFileHash, parsed, persisted] = await Promise.all([
    hashBytes(upload.bytes),
    parseWalletExport(
      {
        name: upload.fileName,
        type: upload.mimeType,
        data: upload.bytes,
      },
      {
        provider: upload.provider,
        maxFileBytes: MAX_IMPORT_FILE_BYTES,
      },
    ),
    dependencies.repository.listWalletTransactions(user.id, upload.provider),
  ]);

  const staged = buildStagedActions(persisted, parsed.transactions);
  const rejectedRows = parsed.issues.filter(
    ({ severity }) => severity === "error",
  ).length;
  const summary: PreviewSummary = {
    accepted: staged.actions.length,
    duplicates: staged.duplicates,
    rejected: rejectedRows + staged.conflicts,
    totalFen: totalFen(staged.actions),
  };
  const existingBatch = await dependencies.repository.findBatchByFileHash(
    user.id,
    upload.provider,
    sourceFileHash,
  );

  if (existingBatch?.status === "completed") {
    return privateJson({
      importId: existingBatch.id,
      accepted: 0,
      duplicates: parsed.transactions.length,
      rejected: rejectedRows,
      totalFen: 0,
    });
  }

  const preview: StagedPreview = {
    version: 1,
    summary,
    actions: [...staged.actions],
  };
  const previewPayloadJson = await encodePreviewPayload(preview);
  const previewPeriod = period(staged.actions);
  const batch = await dependencies.repository.savePreview(
    {
      ownerUserId: user.id,
      provider: upload.provider,
      sourceFilename: upload.fileName,
      sourceFileHash,
      fileSizeBytes: upload.bytes.byteLength,
      periodStart: previewPeriod.start,
      periodEnd: previewPeriod.end,
      totalRows: parsed.transactions.length + rejectedRows,
      duplicateRows: summary.duplicates,
      skippedRows: parsed.rowsSkipped,
      errorRows: summary.rejected,
      errors: parsed.issues,
      summary,
      previewPayloadJson,
      previewExpiresAt: new Date(now.getTime() + IMPORT_PREVIEW_TTL_MS),
      startedAt: now,
    },
    existingBatch?.id,
  );

  return privateJson({ importId: batch.id, ...summary });
}

export async function handleImportConfirmation(
  request: Request,
  batchId: string,
  dependencies: ImportApiDependencies,
): Promise<Response> {
  dependencies.requireSameOrigin(request);
  const user = await dependencies.requireUser(request.headers);
  if (!batchIdIsValid(batchId)) {
    throw new HttpError(400, "INVALID_IMPORT_ID", "The import ID is invalid.");
  }

  const batch = await dependencies.repository.findBatchById(user.id, batchId);
  if (!batch) {
    throw new HttpError(404, "IMPORT_NOT_FOUND", "Import preview not found.");
  }

  const snapshot = {
    importId: batch.id,
    accepted: batch.importedRows,
    duplicates: batch.duplicateRows,
    rejected: batch.errorRows,
    totalFen: batch.totalFen,
  };

  if (batch.status === "completed") {
    return privateJson({ snapshot, message: "Import already confirmed." });
  }

  if (batch.status !== "pending" && batch.status !== "processing") {
    throw new HttpError(
      409,
      "IMPORT_NOT_CONFIRMABLE",
      "This import is not in a confirmable state. Upload the statement again.",
    );
  }

  const now = (dependencies.now ?? (() => new Date()))();
  if (
    !batch.previewPayloadJson ||
    !batch.previewExpiresAt ||
    batch.previewExpiresAt.getTime() <= now.getTime()
  ) {
    await dependencies.repository.expireBatch(user.id, batch.id, now);
    throw new HttpError(
      410,
      "IMPORT_PREVIEW_EXPIRED",
      "This import preview has expired. Upload the statement again.",
    );
  }

  let preview: StagedPreview;
  try {
    preview = await decodePreviewPayload(batch.previewPayloadJson);
  } catch {
    throw new HttpError(
      409,
      "IMPORT_PREVIEW_INVALID",
      "This import preview is no longer valid. Upload the statement again.",
    );
  }

  const importedRows = await dependencies.repository.completeBatch(
    user.id,
    batch.id,
    preview,
    now,
  );
  const confirmedSummary = { ...preview.summary, accepted: importedRows };

  return privateJson({
    snapshot: { importId: batch.id, ...confirmedSummary },
    message:
      importedRows === 0
        ? "No new transactions were added."
        : `${importedRows} transactions imported.`,
  });
}

export async function handleImportHistory(
  request: Request,
  dependencies: ImportApiDependencies,
): Promise<Response> {
  const user = await dependencies.requireUser(request.headers);
  const now = (dependencies.now ?? (() => new Date()))();
  await dependencies.repository.purgeExpiredPreviews(user.id, now);
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 50)
    : 20;
  const imports = await dependencies.repository.listHistory(user.id, limit);

  return privateJson({
    imports: imports.map((batch) => ({
      importId: batch.id,
      provider: batch.provider,
      sourceFilename: batch.sourceFilename,
      status: batch.status,
      accepted: batch.importedRows,
      duplicates: batch.duplicateRows,
      rejected: batch.errorRows,
      totalFen: batch.totalFen,
      totalRows: batch.totalRows,
      skipped: batch.skippedRows,
      createdAt: batch.createdAt.toISOString(),
      completedAt: batch.completedAt?.toISOString() ?? null,
    })),
  });
}

export const __testables = {
  buildStagedActions,
  compactTransaction,
  hashBytes,
  readBoundedRequestBody,
  readMultipartUpload,
};
