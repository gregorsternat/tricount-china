import "server-only";

import { parsePrivateSignupEmails } from "./private-signup-policy";

const LOCAL_AUTH_URL = "http://localhost:3000";

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getAuthSecret(): string {
  const secret = read("BETTER_AUTH_SECRET");

  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is required. Generate one with `openssl rand -base64 32` and store it as a Cloudflare secret.",
    );
  }

  if (secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters long.");
  }

  return secret;
}

export function getAuthBaseUrl(): string {
  const value = read("BETTER_AUTH_URL");

  if (!value && process.env.NODE_ENV !== "production") return LOCAL_AUTH_URL;
  if (!value) throw new Error("BETTER_AUTH_URL is required in production.");

  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("BETTER_AUTH_URL must use HTTPS outside localhost.");
  }

  return url.origin;
}

export function getTrustedAuthOrigins(baseUrl: string): string[] {
  const configured = (read("BETTER_AUTH_TRUSTED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin);

  return [...new Set([new URL(baseUrl).origin, ...configured])];
}

export function getPrivateSignupEmailAllowlist(): Set<string> {
  return parsePrivateSignupEmails(read("PRIVATE_SIGNUP_EMAILS"));
}

export function getPrivateSignupBootstrapToken(): string | undefined {
  const token = read("PRIVATE_SIGNUP_BOOTSTRAP_TOKEN");
  if (token && token.length < 32) {
    throw new Error("PRIVATE_SIGNUP_BOOTSTRAP_TOKEN must be at least 32 characters long.");
  }
  return token;
}
