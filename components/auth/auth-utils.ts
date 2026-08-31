import { enMessages } from "@/lib/i18n/messages/en";
import type {
  AuthErrorMessageKey,
  AuthErrorMessages,
} from "@/lib/i18n/messages/types";

export const AUTH_MIN_PASSWORD_LENGTH = 8;
export const AUTH_MAX_PASSWORD_LENGTH = 128;

type AuthFlow = "sign-in" | "sign-up";

type AuthErrorShape = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  statusText?: unknown;
};

export function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function safeRedirectPath(
  value: string | string[] | undefined,
  fallback = "/",
): string {
  const candidate = firstQueryValue(value)?.trim();

  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001F\u007F]/u.test(candidate)
  ) {
    return fallback;
  }

  return candidate;
}

export function buildAuthHref(
  pathname: "/login" | "/join",
  values: { email?: string; nextPath?: string; token?: string },
): string {
  const query = new URLSearchParams();
  const email = values.email?.trim();
  const nextPath = safeRedirectPath(values.nextPath);
  const token = values.token?.trim();

  if (email) query.set("email", email);
  if (nextPath !== "/") query.set("next", nextPath);
  if (token) query.set("token", token);

  const serialized = query.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

export function getAuthErrorMessage(
  error: unknown,
  flow: AuthFlow,
  messages: AuthErrorMessages = enMessages.auth.errors,
): string {
  return messages[getAuthErrorKey(error, flow)];
}

export function getAuthErrorKey(
  error: unknown,
  flow: AuthFlow,
): AuthErrorMessageKey {
  const details = isAuthErrorShape(error) ? error : undefined;
  const code = String(details?.code ?? "").toUpperCase();
  const message = String(details?.message ?? "").toUpperCase();
  const status = Number(details?.status ?? 0);

  if (status === 429 || code.includes("RATE_LIMIT")) {
    return "rateLimit";
  }

  if (flow === "sign-in") {
    if (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      code.includes("INVALID") ||
      code.includes("PASSWORD") ||
      code.includes("USER_NOT_FOUND") ||
      message.includes("INVALID EMAIL") ||
      message.includes("INVALID PASSWORD") ||
      message.includes("USER NOT FOUND")
    ) {
      return "invalidCredentials";
    }

    return "signInUnavailable";
  }

  if (
    code.includes("INVITATION_REQUIRED") ||
    message.includes("INVITATION IS REQUIRED") ||
    status === 403
  ) {
    return "invitationRequired";
  }

  if (
    code.includes("USER_ALREADY_EXISTS") ||
    code.includes("EMAIL_ALREADY") ||
    message.includes("ALREADY EXISTS")
  ) {
    return "accountExists";
  }

  if (code.includes("PASSWORD") || message.includes("PASSWORD")) {
    return "passwordLength";
  }

  return "signUpUnavailable";
}

function isAuthErrorShape(value: unknown): value is AuthErrorShape {
  return typeof value === "object" && value !== null;
}
