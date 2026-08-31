import { WalletImportError } from "./errors";
import type { FingerprintHasher, WalletProvider } from "./types";

const encoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    throw new WalletImportError(
      "HASH_UNAVAILABLE",
      "Secure transaction fingerprinting is unavailable in this browser.",
    );
  }

  const digest = await subtle.digest("SHA-256", encoder.encode(value));

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function normalizeFingerprintValue(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("zh-CN");
}

export interface TransactionFingerprintFields {
  readonly provider: WalletProvider;
  readonly occurredAt: string;
  readonly amountFen: number;
  readonly direction: string;
  readonly counterparty?: string;
  readonly description?: string;
  readonly merchantOrderId?: string;
  readonly kind: string;
  readonly paymentMethod?: string;
}

/** Mutable fields such as provider status and refund progress are excluded. */
export async function createTransactionFingerprint(
  fields: TransactionFingerprintFields,
  hasher: FingerprintHasher = sha256Hex,
): Promise<string> {
  const canonicalPayload = JSON.stringify([
    fields.provider,
    fields.occurredAt,
    fields.amountFen,
    fields.direction,
    normalizeFingerprintValue(fields.counterparty),
    normalizeFingerprintValue(fields.description),
    normalizeFingerprintValue(fields.merchantOrderId),
    fields.kind,
    normalizeFingerprintValue(fields.paymentMethod),
  ]);

  return hasher(canonicalPayload);
}

export async function createSourceId(
  provider: WalletProvider,
  externalTransactionId: string | undefined,
  fingerprint: string,
  hasher: FingerprintHasher = sha256Hex,
): Promise<string> {
  if (!externalTransactionId) {
    return `${provider}_${fingerprint.slice(0, 32)}`;
  }

  const externalIdHash = await hasher(
    `${provider}:${normalizeFingerprintValue(externalTransactionId)}`,
  );

  return `${provider}_${externalIdHash.slice(0, 32)}`;
}
