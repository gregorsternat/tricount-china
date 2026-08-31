import { HttpError } from "../../../../lib/server/errors";

import {
  MAX_PREVIEW_STORAGE_BYTES,
  stagedPreviewSchema,
  type StagedPreview,
} from "./contracts";

const PAYLOAD_PREFIX = "gzip-base64-v1:";
const MAX_DECOMPRESSED_PREVIEW_BYTES = 48 * 1024 * 1024;
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes: Uint8Array): string {
  let result = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const value = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    result += BASE64_ALPHABET[(value >>> 18) & 63];
    result += BASE64_ALPHABET[(value >>> 12) & 63];
    result += second === undefined ? "=" : BASE64_ALPHABET[(value >>> 6) & 63];
    result += third === undefined ? "=" : BASE64_ALPHABET[value & 63];
  }

  return result;
}

function base64ToBytes(value: string): Uint8Array {
  if (value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/u.test(value)) {
    throw new SyntaxError("Invalid preview payload encoding.");
  }

  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const result = new Uint8Array((value.length / 4) * 3 - padding);
  let outputIndex = 0;

  for (let index = 0; index < value.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(value[index]);
    const second = BASE64_ALPHABET.indexOf(value[index + 1]);
    const third = value[index + 2] === "=" ? 0 : BASE64_ALPHABET.indexOf(value[index + 2]);
    const fourth = value[index + 3] === "=" ? 0 : BASE64_ALPHABET.indexOf(value[index + 3]);

    if (first < 0 || second < 0 || third < 0 || fourth < 0) {
      throw new SyntaxError("Invalid preview payload encoding.");
    }

    const combined = (first << 18) | (second << 12) | (third << 6) | fourth;
    if (outputIndex < result.length) result[outputIndex++] = combined >>> 16;
    if (outputIndex < result.length) result[outputIndex++] = (combined >>> 8) & 0xff;
    if (outputIndex < result.length) result[outputIndex++] = combined & 0xff;
  }

  return result;
}

async function gzip(value: string): Promise<Uint8Array> {
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(value: Uint8Array): Promise<string> {
  const stream = new Blob([Uint8Array.from(value).buffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_DECOMPRESSED_PREVIEW_BYTES) {
      await reader.cancel();
      throw new SyntaxError("Decompressed preview payload is too large.");
    }
    chunks.push(chunk);
  }

  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(output);
}

export async function encodePreviewPayload(preview: StagedPreview): Promise<string> {
  const validated = stagedPreviewSchema.parse(preview);
  const serialized = JSON.stringify(validated);
  if (
    new TextEncoder().encode(serialized).byteLength >
    MAX_DECOMPRESSED_PREVIEW_BYTES
  ) {
    throw new HttpError(
      413,
      "IMPORT_PREVIEW_TOO_LARGE",
      "The parsed preview is too large to store safely. Export a shorter date range and try again.",
    );
  }
  const encoded = `${PAYLOAD_PREFIX}${bytesToBase64(
    await gzip(serialized),
  )}`;

  if (new TextEncoder().encode(encoded).byteLength > MAX_PREVIEW_STORAGE_BYTES) {
    throw new HttpError(
      413,
      "IMPORT_PREVIEW_TOO_LARGE",
      "The parsed preview is too large to store safely. Export a shorter date range and try again.",
    );
  }

  return encoded;
}

export async function decodePreviewPayload(value: string): Promise<StagedPreview> {
  if (!value.startsWith(PAYLOAD_PREFIX)) {
    throw new SyntaxError("Unsupported preview payload version.");
  }

  const compressed = base64ToBytes(value.slice(PAYLOAD_PREFIX.length));
  return stagedPreviewSchema.parse(JSON.parse(await gunzip(compressed)));
}
