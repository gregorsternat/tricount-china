import { WalletImportError } from "../../../../lib/import";

export function hardenImportErrorResponse(response: Response): Response {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export function toWalletImportErrorResponse(error: unknown): Response | null {
  if (!(error instanceof WalletImportError)) return null;

  const status =
    error.code === "FILE_TOO_LARGE" || error.code === "TOO_MANY_ROWS"
      ? 413
      : error.code === "UNSUPPORTED_FILE_TYPE" ||
          error.code === "PDF_NOT_SUPPORTED" ||
          error.code === "LEGACY_XLS_NOT_SUPPORTED" ||
          error.code === "MACRO_XLSX_NOT_SUPPORTED"
        ? 415
        : 422;

  return Response.json(
    { error: { code: error.code, message: error.message } },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
