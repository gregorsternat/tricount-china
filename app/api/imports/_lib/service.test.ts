import { describe, expect, it } from "vitest";

import {
  SYNTHETIC_WECHAT_CSV,
  utf8FixtureBytes,
} from "../../../../lib/import/__fixtures__/synthetic-wallet-exports";
import { parseWalletExport, WalletImportError } from "../../../../lib/import";
import { HttpError, unauthorized } from "../../../../lib/server/errors";

import {
  IMPORT_PREVIEW_TTL_MS,
  MAX_MULTIPART_BODY_BYTES,
  type ImportApiDependencies,
  type ImportBatchRecord,
  type ImportHistoryItem,
  type ImportRepository,
  type PersistedWalletTransaction,
  type SavePreviewInput,
  type StagedPreview,
} from "./contracts";
import {
  hardenImportErrorResponse,
  toWalletImportErrorResponse,
} from "./error-response";
import { decodePreviewPayload, encodePreviewPayload } from "./preview-payload";
import {
  handleImportConfirmation,
  handleImportHistory,
  handleImportPreview,
} from "./service";

const NOW = new Date("2026-08-31T12:00:00.000Z");

class FakeImportRepository implements ImportRepository {
  readonly batches = new Map<string, ImportBatchRecord>();
  readonly transactions: PersistedWalletTransaction[] = [];
  readonly savedPreviews: SavePreviewInput[] = [];
  readonly completed: Array<{
    ownerUserId: string;
    batchId: string;
    preview: StagedPreview;
  }> = [];
  readonly expired: string[] = [];
  historyLimit: number | null = null;
  private nextBatch = 1;

  async purgeExpiredPreviews(
    ownerUserId: string,
    expiredAt: Date,
  ): Promise<number> {
    let purged = 0;
    for (const [id, batch] of this.batches) {
      if (
        batch.ownerUserId === ownerUserId &&
        (batch.status === "pending" || batch.status === "processing") &&
        batch.previewExpiresAt &&
        batch.previewExpiresAt <= expiredAt
      ) {
        purged += 1;
        this.batches.set(id, {
          ...batch,
          status: "failed",
          previewPayloadJson: null,
          previewExpiresAt: null,
          completedAt: expiredAt,
        });
      }
    }
    return purged;
  }

  async findBatchByFileHash(
    ownerUserId: string,
    provider: "wechat" | "alipay",
    sourceFileHash: string,
  ): Promise<ImportBatchRecord | null> {
    return (
      [...this.batches.values()].find(
        (batch) =>
          batch.ownerUserId === ownerUserId &&
          batch.provider === provider &&
          batch.sourceFileHash === sourceFileHash,
      ) ?? null
    );
  }

  async savePreview(
    input: SavePreviewInput,
    existingBatchId?: string,
  ): Promise<ImportBatchRecord> {
    this.savedPreviews.push(input);
    const previous = existingBatchId ? this.batches.get(existingBatchId) : undefined;
    const id = previous?.id ?? `batch-${this.nextBatch++}`;
    const batch: ImportBatchRecord = {
      id,
      ownerUserId: input.ownerUserId,
      provider: input.provider,
      sourceFilename: input.sourceFilename,
      sourceFileHash: input.sourceFileHash,
      fileSizeBytes: input.fileSizeBytes,
      status: "pending",
      totalRows: input.totalRows,
      importedRows: 0,
      duplicateRows: input.duplicateRows,
      skippedRows: input.skippedRows,
      errorRows: input.errorRows,
      totalFen: input.summary.totalFen,
      previewPayloadJson: input.previewPayloadJson,
      previewExpiresAt: input.previewExpiresAt,
      completedAt: null,
      createdAt: previous?.createdAt ?? input.startedAt,
    };
    this.batches.set(id, batch);
    return batch;
  }

  async listWalletTransactions(
    ownerUserId: string,
    provider: "wechat" | "alipay",
  ): Promise<readonly PersistedWalletTransaction[]> {
    return this.transactions.filter(
      ({ transaction }) =>
        transaction.source === provider &&
        // IDs in this fake are prefixed with the owner for explicit isolation.
        idOwner(transaction.sourceId) === ownerUserId,
    );
  }

  async findBatchById(
    ownerUserId: string,
    batchId: string,
  ): Promise<ImportBatchRecord | null> {
    const batch = this.batches.get(batchId);
    return batch?.ownerUserId === ownerUserId ? batch : null;
  }

  async completeBatch(
    ownerUserId: string,
    batchId: string,
    preview: StagedPreview,
    completedAt: Date,
  ): Promise<number> {
    this.completed.push({ ownerUserId, batchId, preview });
    for (const action of preview.actions) {
      if (action.action === "insert") {
        this.transactions.push({
          id: `wallet-${this.transactions.length + 1}`,
          transaction: {
            ...action.transaction,
            sourceId: ownedId(ownerUserId, action.transaction.sourceId),
          },
        });
      } else {
        const index = this.transactions.findIndex(({ id }) => id === action.existingId);
        if (index >= 0) {
          this.transactions[index] = {
            id: action.existingId,
            transaction: {
              ...action.transaction,
              sourceId: ownedId(ownerUserId, action.transaction.sourceId),
            },
          };
        }
      }
    }

    const current = this.batches.get(batchId);
    if (!current || current.ownerUserId !== ownerUserId) return 0;
    this.batches.set(batchId, {
      ...current,
      status: "completed",
      importedRows: preview.summary.accepted,
      duplicateRows: preview.summary.duplicates,
      errorRows: preview.summary.rejected,
      totalFen: preview.summary.totalFen,
      previewPayloadJson: null,
      previewExpiresAt: null,
      completedAt,
    });
    return preview.summary.accepted;
  }

  async expireBatch(
    ownerUserId: string,
    batchId: string,
    expiredAt: Date,
  ): Promise<void> {
    const current = this.batches.get(batchId);
    if (!current || current.ownerUserId !== ownerUserId) return;
    this.expired.push(batchId);
    this.batches.set(batchId, {
      ...current,
      status: "failed",
      previewPayloadJson: null,
      previewExpiresAt: null,
      completedAt: expiredAt,
    });
  }

  async listHistory(
    ownerUserId: string,
    limit: number,
  ): Promise<readonly ImportHistoryItem[]> {
    this.historyLimit = limit;
    return [...this.batches.values()]
      .filter((batch) => batch.ownerUserId === ownerUserId)
      .slice(0, limit)
      .map((batch) => ({
        id: batch.id,
        provider: batch.provider,
        sourceFilename: batch.sourceFilename,
        status: batch.status,
        totalRows: batch.totalRows,
        importedRows: batch.importedRows,
        duplicateRows: batch.duplicateRows,
        skippedRows: batch.skippedRows,
        errorRows: batch.errorRows,
        totalFen: batch.totalFen,
        createdAt: batch.createdAt,
        completedAt: batch.completedAt,
      }));
  }
}

function ownedId(ownerUserId: string, sourceId: string): string {
  return `${ownerUserId}::${sourceId.replace(/^[^:]+::/u, "")}`;
}

function idOwner(sourceId: string): string | null {
  return sourceId.includes("::") ? sourceId.split("::", 1)[0] : null;
}

function dependencies(
  repository: ImportRepository,
  options: { readonly userId?: string; readonly now?: Date } = {},
): ImportApiDependencies {
  return {
    repository,
    requireSameOrigin(request) {
      if (request.headers.get("origin") !== new URL(request.url).origin) {
        throw new HttpError(403, "FORBIDDEN", "Cross-origin mutation rejected.");
      }
    },
    async requireUser() {
      if (!options.userId) throw unauthorized();
      return { id: options.userId };
    },
    now: () => options.now ?? NOW,
  };
}

function previewRequest(
  source: "wechat" | "alipay" = "wechat",
  contents = SYNTHETIC_WECHAT_CSV,
): Request {
  const form = new FormData();
  form.set("source", source);
  form.set(
    "file",
    new File([Uint8Array.from(utf8FixtureBytes(contents)).buffer], "synthetic-wechat.csv", {
      type: "text/csv",
    }),
  );
  return new Request("https://fen.example/api/imports/preview", {
    method: "POST",
    headers: { Origin: "https://fen.example" },
    body: form,
  });
}

function confirmRequest(): Request {
  return new Request("https://fen.example/api/imports/batch-1/confirm", {
    method: "POST",
    headers: { Origin: "https://fen.example" },
  });
}

async function responseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("import preview and confirmation service", () => {
  it("authenticates, parses and stores a private expiring preview without raw file bytes", async () => {
    const repository = new FakeImportRepository();
    const response = await handleImportPreview(
      previewRequest(),
      dependencies(repository, { userId: "user-1" }),
    );
    const payload = await responseJson<{
      importId: string;
      accepted: number;
      duplicates: number;
      rejected: number;
      totalFen: number;
    }>(response);

    expect(payload).toEqual({
      importId: "batch-1",
      accepted: 4,
      duplicates: 0,
      rejected: 0,
      totalFen: 14_234,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const saved = repository.savedPreviews[0];
    expect(saved.ownerUserId).toBe("user-1");
    expect(saved.previewExpiresAt.getTime() - NOW.getTime()).toBe(
      IMPORT_PREVIEW_TTL_MS,
    );
    expect(saved.sourceFileHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(saved.previewPayloadJson).toMatch(/^gzip-base64-v1:/u);
    expect(saved.previewPayloadJson).not.toContain("微信支付账单明细");
    expect("bytes" in saved).toBe(false);

    const staged = await decodePreviewPayload(saved.previewPayloadJson);
    expect(staged.actions).toHaveLength(4);
    expect(staged.actions[0].transaction.rawData["交易单号"]).toBe(
      "WX-SYNTH-0001",
    );
  });

  it("confirms once, clears the preview and returns the same snapshot idempotently", async () => {
    const repository = new FakeImportRepository();
    const deps = dependencies(repository, { userId: "user-1" });
    await handleImportPreview(previewRequest(), deps);

    const first = await handleImportConfirmation(confirmRequest(), "batch-1", deps);
    expect(await responseJson(first)).toEqual({
      snapshot: {
        importId: "batch-1",
        accepted: 4,
        duplicates: 0,
        rejected: 0,
        totalFen: 14_234,
      },
      message: "4 transactions imported.",
    });
    expect(repository.transactions).toHaveLength(4);
    expect(repository.batches.get("batch-1")).toMatchObject({
      status: "completed",
      previewPayloadJson: null,
      previewExpiresAt: null,
    });

    const second = await handleImportConfirmation(confirmRequest(), "batch-1", deps);
    expect(await responseJson(second)).toEqual({
      snapshot: {
        importId: "batch-1",
        accepted: 4,
        duplicates: 0,
        rejected: 0,
        totalFen: 14_234,
      },
      message: "Import already confirmed.",
    });
    expect(repository.completed).toHaveLength(1);
    expect(repository.transactions).toHaveLength(4);
  });

  it("deduplicates against the authenticated user's existing wallet rows", async () => {
    const repository = new FakeImportRepository();
    const parsed = await parseWalletExport(
      {
        name: "wechat.csv",
        data: utf8FixtureBytes(SYNTHETIC_WECHAT_CSV),
      },
      { provider: "wechat" },
    );
    repository.transactions.push({
      id: "wallet-existing",
      transaction: {
        ...parsed.transactions[0],
        sourceId: ownedId("user-1", parsed.transactions[0].sourceId),
      },
    });

    const response = await handleImportPreview(
      previewRequest(),
      dependencies(repository, { userId: "user-1" }),
    );
    const payload = await responseJson<{
      accepted: number;
      duplicates: number;
      totalFen: number;
    }>(response);

    // The fake ownership prefix changes the persisted source ID, but the
    // fingerprint still provides the safe fallback deduplication match.
    expect(payload).toMatchObject({ accepted: 3, duplicates: 1, totalFen: 13_000 });
  });

  it("stages a provider status upgrade as an in-place private update", async () => {
    const repository = new FakeImportRepository();
    const parsed = await parseWalletExport(
      { name: "wechat.csv", data: utf8FixtureBytes(SYNTHETIC_WECHAT_CSV) },
      { provider: "wechat" },
    );
    repository.transactions.push({
      id: "wallet-pending",
      transaction: {
        ...parsed.transactions[3],
        sourceId: ownedId("user-1", parsed.transactions[3].sourceId),
      },
    });

    const response = await handleImportPreview(
      previewRequest(
        "wechat",
        SYNTHETIC_WECHAT_CSV.replace("处理中", "支付成功"),
      ),
      dependencies(repository, { userId: "user-1" }),
    );
    expect(await responseJson(response)).toMatchObject({
      accepted: 4,
      duplicates: 0,
    });

    const preview = await decodePreviewPayload(
      repository.savedPreviews[0].previewPayloadJson,
    );
    expect(preview.actions).toContainEqual(
      expect.objectContaining({
        action: "update",
        existingId: "wallet-pending",
        transaction: expect.objectContaining({ status: "completed" }),
      }),
    );

    await handleImportConfirmation(
      confirmRequest(),
      "batch-1",
      dependencies(repository, { userId: "user-1" }),
    );
    expect(repository.transactions).toHaveLength(4);
    expect(repository.transactions.find(({ id }) => id === "wallet-pending"))
      .toMatchObject({ transaction: { status: "completed" } });
  });

  it("does not read or deduplicate another user's private transactions", async () => {
    const repository = new FakeImportRepository();
    const parsed = await parseWalletExport(
      { name: "wechat.csv", data: utf8FixtureBytes(SYNTHETIC_WECHAT_CSV) },
      { provider: "wechat" },
    );
    repository.transactions.push({
      id: "wallet-other-user",
      transaction: {
        ...parsed.transactions[0],
        sourceId: ownedId("user-2", parsed.transactions[0].sourceId),
      },
    });

    const response = await handleImportPreview(
      previewRequest(),
      dependencies(repository, { userId: "user-1" }),
    );
    expect(await responseJson(response)).toMatchObject({
      accepted: 4,
      duplicates: 0,
    });
  });

  it("expires stale previews and never confirms their staged rows", async () => {
    const repository = new FakeImportRepository();
    await handleImportPreview(
      previewRequest(),
      dependencies(repository, { userId: "user-1" }),
    );

    const expiredDependencies = dependencies(repository, {
      userId: "user-1",
      now: new Date(NOW.getTime() + IMPORT_PREVIEW_TTL_MS + 1),
    });
    await expect(
      handleImportConfirmation(confirmRequest(), "batch-1", expiredDependencies),
    ).rejects.toMatchObject({ status: 410, code: "IMPORT_PREVIEW_EXPIRED" });
    expect(repository.expired).toEqual(["batch-1"]);
    expect(repository.completed).toHaveLength(0);
  });

  it("checks same-origin before authentication and parsing", async () => {
    const repository = new FakeImportRepository();
    let authenticated = false;
    const deps: ImportApiDependencies = {
      repository,
      requireSameOrigin() {
        throw new HttpError(403, "FORBIDDEN", "Rejected.");
      },
      async requireUser() {
        authenticated = true;
        return { id: "user-1" };
      },
    };

    await expect(handleImportPreview(previewRequest(), deps)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    expect(authenticated).toBe(false);
    expect(repository.savedPreviews).toHaveLength(0);
  });

  it("rejects oversized multipart bodies before materializing form data", async () => {
    const request = new Request("https://fen.example/api/imports/preview", {
      method: "POST",
      headers: {
        Origin: "https://fen.example",
        "Content-Type": "multipart/form-data; boundary=synthetic",
        "Content-Length": String(MAX_MULTIPART_BODY_BYTES + 1),
      },
      body: "--synthetic--",
    });

    await expect(
      handleImportPreview(
        request,
        dependencies(new FakeImportRepository(), { userId: "user-1" }),
      ),
    ).rejects.toMatchObject({ status: 413, code: "IMPORT_FILE_TOO_LARGE" });
  });

  it("caps chunked multipart streams even when content-length is absent", async () => {
    const chunk = new Uint8Array(256 * 1024);
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("https://fen.example/api/imports/preview", {
      method: "POST",
      headers: {
        Origin: "https://fen.example",
        "Content-Type": "multipart/form-data; boundary=synthetic",
      },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect(request.headers.get("content-length")).toBeNull();
    await expect(
      handleImportPreview(
        request,
        dependencies(new FakeImportRepository(), { userId: "user-1" }),
      ),
    ).rejects.toMatchObject({ status: 413, code: "IMPORT_FILE_TOO_LARGE" });
    expect(cancelled).toBe(true);
  });

  it("returns only the authenticated user's bounded import history", async () => {
    const repository = new FakeImportRepository();
    await handleImportPreview(
      previewRequest(),
      dependencies(repository, { userId: "user-1" }),
    );
    await handleImportPreview(
      previewRequest(),
      dependencies(repository, { userId: "user-2" }),
    );

    const response = await handleImportHistory(
      new Request("https://fen.example/api/imports?limit=999"),
      dependencies(repository, { userId: "user-1" }),
    );
    const payload = await responseJson<{ imports: Array<{ importId: string }> }>(
      response,
    );
    expect(payload.imports).toEqual([
      {
        importId: "batch-1",
        provider: "wechat",
        sourceFilename: "synthetic-wechat.csv",
        status: "pending",
        accepted: 0,
        duplicates: 0,
        rejected: 0,
        totalFen: 14_234,
        totalRows: 4,
        skipped: 4,
        createdAt: NOW.toISOString(),
        completedAt: null,
      },
    ]);
    expect(repository.historyLimit).toBe(50);
  });
});

describe("preview payload and API errors", () => {
  it("round-trips a validated compressed payload and rejects tampering", async () => {
    const preview: StagedPreview = {
      version: 1,
      summary: { accepted: 0, duplicates: 0, rejected: 0, totalFen: 0 },
      actions: [],
    };
    const encoded = await encodePreviewPayload(preview);
    expect(await decodePreviewPayload(encoded)).toEqual(preview);
    await expect(decodePreviewPayload(`${encoded.slice(0, -2)}??`)).rejects.toThrow();
  });

  it("maps parser failures to a non-leaking client error", async () => {
    const response = hardenImportErrorResponse(
      toWalletImportErrorResponse(
        new WalletImportError("PDF_NOT_SUPPORTED", "Use CSV instead."),
      )!,
    );
    expect(response.status).toBe(415);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await responseJson(response)).toEqual({
      error: { code: "PDF_NOT_SUPPORTED", message: "Use CSV instead." },
    });
  });
});
