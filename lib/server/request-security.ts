import "server-only";

import { ZodError } from "zod";

import { getAuthBaseUrl, getTrustedAuthOrigins } from "./env";
import { forbidden, HttpError } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireSameOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const originHeader = request.headers.get("origin");
  if (!originHeader) throw forbidden("Missing request origin.");

  let origin: string;
  try {
    origin = new URL(originHeader).origin;
  } catch {
    throw forbidden("Invalid request origin.");
  }

  const requestOrigin = new URL(request.url).origin;
  const baseUrl = getAuthBaseUrl();
  const allowedOrigins = new Set([
    requestOrigin,
    ...getTrustedAuthOrigins(baseUrl),
  ]);

  if (!allowedOrigins.has(origin)) {
    throw forbidden("Cross-origin mutation rejected.");
  }
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof SyntaxError) {
    return Response.json(
      { error: { code: "INVALID_JSON", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request data is invalid.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  console.error("Unhandled API error", error);
  return Response.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred.",
      },
    },
    { status: 500 },
  );
}
