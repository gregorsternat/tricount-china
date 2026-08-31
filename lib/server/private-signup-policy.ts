const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITATION_TOKEN_BYTES = 32;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidNormalizedEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value) && value === normalizeEmail(value);
}

export function parsePrivateSignupEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(/[;,\n]/)
      .map(normalizeEmail)
      .filter(isValidNormalizedEmail),
  );
}

export function isAllowlistedEmail(
  email: string,
  serializedAllowlist: string | undefined,
): boolean {
  return parsePrivateSignupEmails(serializedAllowlist).has(normalizeEmail(email));
}

export function createInvitationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITATION_TOKEN_BYTES));
  return bytesToBase64Url(bytes);
}

export async function hashInvitationToken(token: string): Promise<string> {
  if (token.length < 32 || token.length > 512) {
    throw new Error("Invitation token must contain between 32 and 512 characters.");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function secureTokenMatches(
  candidate: string,
  expected: string,
): Promise<boolean> {
  if (candidate.length < 32 || candidate.length > 512 || expected.length < 32) {
    return false;
  }
  const [candidateHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(candidate)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected)),
  ]);
  const left = new Uint8Array(candidateHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}
