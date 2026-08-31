export type WalletImportErrorCode =
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_ROWS"
  | "UNSUPPORTED_FILE_TYPE"
  | "PDF_NOT_SUPPORTED"
  | "LEGACY_XLS_NOT_SUPPORTED"
  | "MACRO_XLSX_NOT_SUPPORTED"
  | "INVALID_ENCODING"
  | "MALFORMED_CSV"
  | "INVALID_SPREADSHEET"
  | "UNSAFE_SPREADSHEET"
  | "PROVIDER_NOT_DETECTED"
  | "HEADER_NOT_FOUND"
  | "NO_VALID_TRANSACTIONS"
  | "HASH_UNAVAILABLE";

export class WalletImportError extends Error {
  readonly code: WalletImportErrorCode;

  constructor(code: WalletImportErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "WalletImportError";
    this.code = code;
  }
}
