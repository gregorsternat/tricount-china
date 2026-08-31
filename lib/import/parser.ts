import Papa from "papaparse";
import readXlsxFile from "read-excel-file/universal";

import { WalletImportError } from "./errors";
import {
  createSourceId,
  createTransactionFingerprint,
  sha256Hex,
} from "./fingerprint";
import {
  WALLET_IMPORT_PARSER_VERSION,
  type FingerprintHasher,
  type WalletFileFormat,
  type WalletImportInput,
  type WalletImportIssue,
  type WalletImportOptions,
  type WalletImportResult,
  type WalletProvider,
  type WalletTextEncoding,
  type WalletTransaction,
  type WalletTransactionDirection,
  type WalletTransactionKind,
  type WalletTransactionStatus,
} from "./types";

export const DEFAULT_MAX_WALLET_FILE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_WALLET_ROWS = 25_000;

const MAX_HEADER_SCAN_ROWS = 200;
const MAX_XLSX_ENTRIES = 512;
const MAX_XLSX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_XLSX_TOTAL_COMPRESSION_RATIO = 250;
const MAX_XLSX_ENTRY_COMPRESSION_RATIO = 1_000;

type Cell = unknown;
type Matrix = readonly (readonly Cell[])[];

type CanonicalField =
  | "occurredAt"
  | "direction"
  | "amount"
  | "refundAmount"
  | "status"
  | "transactionType"
  | "counterparty"
  | "description"
  | "category"
  | "paymentMethod"
  | "transactionId"
  | "merchantOrderId"
  | "relatedTransactionId"
  | "note";

const HEADER_ALIASES: Readonly<Record<CanonicalField, readonly string[]>> = {
  occurredAt: [
    "交易时间",
    "交易创建时间",
    "创建时间",
    "付款时间",
    "支付时间",
    "入账时间",
  ],
  direction: ["收/支", "收支", "收支类型", "资金流向", "收入/支出"],
  amount: [
    "金额(元)",
    "交易金额(元)",
    "订单金额(元)",
    "金额",
    "交易金额",
    "订单金额",
  ],
  refundAmount: [
    "成功退款(元)",
    "成功退款金额(元)",
    "退款金额(元)",
    "已退款金额(元)",
    "成功退款",
    "退款金额",
  ],
  status: ["当前状态", "交易状态", "订单状态", "资金状态", "状态"],
  transactionType: ["交易类型", "业务类型", "类型"],
  counterparty: [
    "交易对方",
    "对方名称",
    "商户名称",
    "收款方",
    "付款方",
    "对方账号",
  ],
  description: [
    "商品",
    "商品名称",
    "商品说明",
    "交易说明",
    "订单标题",
    "摘要",
  ],
  category: ["交易分类", "账单分类", "分类"],
  paymentMethod: [
    "支付方式",
    "付款方式",
    "收/付款方式",
    "收付款方式",
    "资金渠道",
  ],
  transactionId: [
    "交易单号",
    "交易号",
    "交易订单号",
    "微信支付订单号",
    "支付宝交易号",
    "订单号",
  ],
  merchantOrderId: [
    "商户单号",
    "商户订单号",
    "商家订单号",
    "外部订单号",
  ],
  relatedTransactionId: [
    "关联交易号",
    "原交易号",
    "原交易单号",
    "关联订单号",
  ],
  note: ["备注", "交易备注", "说明"],
};

interface DecodedCsv {
  readonly text: string;
  readonly encoding: WalletTextEncoding;
}

interface LocatedHeader {
  readonly index: number;
  readonly headers: readonly string[];
  readonly columns: Readonly<Partial<Record<CanonicalField, number>>>;
}

interface ParsedMatrix {
  readonly transactions: readonly WalletTransaction[];
  readonly issues: readonly WalletImportIssue[];
  readonly headerRow: number;
  readonly rowsRead: number;
  readonly rowsSkipped: number;
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/u, "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, "")
    .toLocaleLowerCase("zh-CN");
}

const NORMALIZED_HEADER_ALIASES = Object.fromEntries(
  Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
    field,
    aliases.map(normalizeHeader),
  ]),
) as unknown as Readonly<Record<CanonicalField, readonly string[]>>;

function cellToString(value: Cell): string {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    const hours = String(value.getUTCHours()).padStart(2, "0");
    const minutes = String(value.getUTCMinutes()).padStart(2, "0");
    const seconds = String(value.getUTCSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  return String(value).trim();
}

function normalizedOptional(value: Cell): string | undefined {
  const normalized = cellToString(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function resolveCell(
  row: readonly Cell[],
  columns: Readonly<Partial<Record<CanonicalField, number>>>,
  field: CanonicalField,
): Cell {
  const index = columns[field];
  return index === undefined ? undefined : row[index];
}

function resolveString(
  row: readonly Cell[],
  columns: Readonly<Partial<Record<CanonicalField, number>>>,
  field: CanonicalField,
): string | undefined {
  return normalizedOptional(resolveCell(row, columns, field));
}

function findHeader(matrix: Matrix): LocatedHeader {
  const rowsToInspect = Math.min(matrix.length, MAX_HEADER_SCAN_ROWS);

  for (let index = 0; index < rowsToInspect; index += 1) {
    const headers = matrix[index].map(cellToString);
    const lookup = new Map<string, number>();

    headers.forEach((header, columnIndex) => {
      const normalized = normalizeHeader(header);
      if (normalized && !lookup.has(normalized)) {
        lookup.set(normalized, columnIndex);
      }
    });

    const columns: Partial<Record<CanonicalField, number>> = {};

    for (const field of Object.keys(HEADER_ALIASES) as CanonicalField[]) {
      for (const alias of NORMALIZED_HEADER_ALIASES[field]) {
        const columnIndex = lookup.get(alias);
        if (columnIndex !== undefined) {
          columns[field] = columnIndex;
          break;
        }
      }
    }

    const supportingColumns = [
      columns.direction,
      columns.status,
      columns.transactionId,
      columns.counterparty,
    ].filter((column) => column !== undefined).length;

    if (
      columns.occurredAt !== undefined &&
      columns.amount !== undefined &&
      supportingColumns >= 1
    ) {
      return { index, headers, columns };
    }
  }

  throw new WalletImportError(
    "HEADER_NOT_FOUND",
    "Could not find the transaction header (for example 交易时间 and 金额). Select an original WeChat Pay or Alipay export without editing it.",
  );
}

function isBlankRow(row: readonly Cell[]): boolean {
  return row.every((cell) => cellToString(cell).length === 0);
}

function looksLikeNonTransactionRow(row: readonly Cell[]): boolean {
  const joined = row.map(cellToString).join(" ");
  return /(?:导出时间|导出信息|记录条数|交易记录明细查询|账单明细|^[-—_=*]{4,}$|共\s*\d+\s*笔|合计)/u.test(
    joined,
  );
}

function parseAmountToFen(value: Cell): number | null {
  let text = cellToString(value).normalize("NFKC").trim();
  if (!text) return null;

  const negativeParentheses = /^\(.*\)$/u.test(text);
  text = text
    .replace(/^\((.*)\)$/u, "$1")
    .replace(/(?:人民币|RMB|CNY|CN¥|¥|￥|元)/giu, "")
    .replace(/\s+/gu, "")
    .trim();

  let negative = negativeParentheses;
  if (/^[+-]/u.test(text)) {
    negative ||= text.startsWith("-");
    text = text.slice(1);
  }

  if (text.includes(",") && !text.includes(".")) {
    const commaParts = text.split(",");
    const lastPart = commaParts.at(-1) ?? "";
    const thousandsSeparated =
      commaParts.length > 1 &&
      commaParts.slice(1).every((part) => /^\d{3}$/u.test(part));

    if (!thousandsSeparated && /^\d{1,2}$/u.test(lastPart)) {
      text = `${commaParts.slice(0, -1).join("")}.${lastPart}`;
    }
  }

  text = text.replace(/,/gu, "");
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(text);
  if (!match) return null;

  const fractional = match[2] ?? "";
  if (fractional.length > 2 && /[^0]/u.test(fractional.slice(2))) return null;

  const yuan = Number(match[1]);
  const fen = Number(fractional.slice(0, 2).padEnd(2, "0"));
  if (!Number.isSafeInteger(yuan) || yuan > (Number.MAX_SAFE_INTEGER - fen) / 100) {
    return null;
  }

  const amountFen = yuan * 100 + fen;
  // Direction carries the sign, but accepting signed provider values makes the
  // parser resilient to historical exports.
  return negative ? Math.abs(amountFen) : amountFen;
}

function formatChinaTimestamp(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string | null {
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+08:00`;
}

function parseOccurredAt(value: Cell): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return formatChinaTimestamp(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
    );
  }

  if (typeof value === "number" && value >= 1 && value < 100_000) {
    const excelDate = new Date(Math.round((value - 25_569) * 86_400_000));
    return formatChinaTimestamp(
      excelDate.getUTCFullYear(),
      excelDate.getUTCMonth() + 1,
      excelDate.getUTCDate(),
      excelDate.getUTCHours(),
      excelDate.getUTCMinutes(),
      excelDate.getUTCSeconds(),
    );
  }

  const text = cellToString(value).normalize("NFKC").trim();
  const match =
    /^(\d{4})\s*(?:[-/.年])\s*(\d{1,2})\s*(?:[-/.月])\s*(\d{1,2})\s*(?:日)?(?:[T\s]+(\d{1,2})(?::|时)(\d{1,2})(?:(?::|分)(\d{1,2}))?(?:秒)?)?$/u.exec(
      text,
    );

  if (!match) return null;

  return formatChinaTimestamp(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
    Number(match[6] ?? 0),
  );
}

function parseDirection(value: string | undefined): WalletTransactionDirection {
  const normalized = (value ?? "").normalize("NFKC").replace(/\s+/gu, "");

  if (/不计收支|中性|其他/u.test(normalized)) return "neutral";
  if (/支出|已支出|付款|^支$/u.test(normalized)) return "outflow";
  if (/收入|已收入|收款|^收$/u.test(normalized)) return "inflow";
  return "unknown";
}

function inferKind(value: string): WalletTransactionKind {
  if (/退款|退回/u.test(value)) return "refund";
  if (/转账|转入|转出|红包|收钱|AA收款|还款/u.test(value)) return "transfer";
  if (/充值/u.test(value)) return "top_up";
  if (/提现/u.test(value)) return "withdrawal";
  if (/消费|支付|付款|扫码|商户/u.test(value)) return "payment";
  return "other";
}

function parseStatus(value: string | undefined): WalletTransactionStatus {
  const normalized = (value ?? "").normalize("NFKC").replace(/\s+/gu, "");
  if (!normalized) return "unknown";

  if (/部分退款/u.test(normalized)) return "partially_refunded";
  if (/退款中|处理中|进行中|等待|待付款|待处理/u.test(normalized)) {
    return "pending";
  }
  if (/全额退款|退款成功|已退款/u.test(normalized)) return "refunded";
  if (/失败|未成功|已拒绝/u.test(normalized)) return "failed";
  if (/关闭|取消|撤销|已过期/u.test(normalized)) return "cancelled";
  if (/成功|已收钱|已到账|已入账|已存入|已完成|已转账/u.test(normalized)) {
    return "completed";
  }
  return "unknown";
}

function createRawData(
  headers: readonly string[],
  row: readonly Cell[],
): Readonly<Record<string, string>> {
  const rawData: Record<string, string> = {};
  const headerOccurrences = new Map<string, number>();

  headers.forEach((header, index) => {
    const baseKey = header.trim() || `column_${index + 1}`;
    const occurrence = (headerOccurrences.get(baseKey) ?? 0) + 1;
    headerOccurrences.set(baseKey, occurrence);
    const key = occurrence === 1 ? baseKey : `${baseKey}#${occurrence}`;
    rawData[key] = cellToString(row[index]);
  });

  return rawData;
}

function issue(
  row: number,
  severity: WalletImportIssue["severity"],
  code: WalletImportIssue["code"],
  message: string,
): WalletImportIssue {
  return { row, severity, code, message };
}

async function parseMatrix(
  matrix: Matrix,
  provider: WalletProvider,
  maxRows: number,
  hasher: FingerprintHasher,
): Promise<ParsedMatrix> {
  if (matrix.length > maxRows) {
    throw new WalletImportError(
      "TOO_MANY_ROWS",
      `This export contains ${matrix.length.toLocaleString("en-US")} rows; the limit is ${maxRows.toLocaleString("en-US")}. Export a shorter date range and try again.`,
    );
  }

  const header = findHeader(matrix);
  const transactions: WalletTransaction[] = [];
  const issues: WalletImportIssue[] = [];
  let rowsSkipped = header.index;

  for (let index = header.index + 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    const sourceRow = index + 1;

    if (isBlankRow(row) || looksLikeNonTransactionRow(row)) {
      rowsSkipped += 1;
      continue;
    }

    const occurredAtCell = resolveCell(row, header.columns, "occurredAt");
    const amountCell = resolveCell(row, header.columns, "amount");
    const occurredAtRaw = normalizedOptional(occurredAtCell);
    const amountRaw = normalizedOptional(amountCell);

    if (!occurredAtRaw && !amountRaw) {
      rowsSkipped += 1;
      continue;
    }

    if (!occurredAtRaw) {
      issues.push(
        issue(sourceRow, "error", "MISSING_DATE", "Transaction date is missing."),
      );
      rowsSkipped += 1;
      continue;
    }

    if (!amountRaw) {
      issues.push(
        issue(sourceRow, "error", "MISSING_AMOUNT", "Transaction amount is missing."),
      );
      rowsSkipped += 1;
      continue;
    }

    const occurredAt = parseOccurredAt(occurredAtCell);
    if (!occurredAt) {
      issues.push(
        issue(
          sourceRow,
          "error",
          "INVALID_DATE",
          "Transaction date is not in a supported WeChat Pay or Alipay format.",
        ),
      );
      rowsSkipped += 1;
      continue;
    }

    const amountFen = parseAmountToFen(amountCell);
    if (amountFen === null) {
      issues.push(
        issue(
          sourceRow,
          "error",
          "INVALID_AMOUNT",
          "Transaction amount is invalid or exceeds the safe integer range.",
        ),
      );
      rowsSkipped += 1;
      continue;
    }

    const directionRaw = resolveString(row, header.columns, "direction");
    let direction = parseDirection(directionRaw);
    const statusRaw = resolveString(row, header.columns, "status");
    let status = parseStatus(statusRaw);
    const transactionType = resolveString(row, header.columns, "transactionType");
    const description = resolveString(row, header.columns, "description");
    const primaryClassification = [transactionType, description]
      .filter(Boolean)
      .join(" ");
    const kind = inferKind(primaryClassification || statusRaw || "");
    const refundAmountRaw = resolveCell(row, header.columns, "refundAmount");
    const parsedRefundAmountFen = normalizedOptional(refundAmountRaw)
      ? parseAmountToFen(refundAmountRaw)
      : null;
    const refundAmountFen =
      parsedRefundAmountFen !== null && parsedRefundAmountFen > 0
        ? parsedRefundAmountFen
        : undefined;
    const isRefund =
      kind === "refund" ||
      refundAmountFen !== undefined ||
      status === "refunded" ||
      status === "partially_refunded";

    if (refundAmountFen !== undefined) {
      status = refundAmountFen >= amountFen ? "refunded" : "partially_refunded";
    }

    if (kind === "refund" && (direction === "unknown" || direction === "neutral")) {
      direction = "inflow";
    }

    if (direction === "unknown") {
      issues.push(
        issue(
          sourceRow,
          "warning",
          "UNKNOWN_DIRECTION",
          "Transaction direction was not recognized; review it before including it in totals.",
        ),
      );
    }

    if (status === "unknown") {
      issues.push(
        issue(
          sourceRow,
          "warning",
          "UNKNOWN_STATUS",
          "Transaction status was not recognized; review it before including it in totals.",
        ),
      );
    }

    const counterparty = resolveString(row, header.columns, "counterparty");
    const merchantOrderId = resolveString(row, header.columns, "merchantOrderId");
    const paymentMethod = resolveString(row, header.columns, "paymentMethod");
    const externalTransactionId = resolveString(
      row,
      header.columns,
      "transactionId",
    );
    const fingerprint = await createTransactionFingerprint(
      {
        provider,
        occurredAt,
        amountFen,
        direction,
        counterparty,
        description,
        merchantOrderId,
        kind,
        paymentMethod,
      },
      hasher,
    );
    const sourceId = await createSourceId(
      provider,
      externalTransactionId,
      fingerprint,
      hasher,
    );

    transactions.push({
      source: provider,
      sourceId,
      externalTransactionId,
      merchantOrderId,
      fingerprint,
      parserVersion: WALLET_IMPORT_PARSER_VERSION,
      occurredAt,
      timezone: "Asia/Shanghai",
      amountFen,
      currency: "CNY",
      direction,
      status,
      kind,
      isRefund,
      refundAmountFen,
      relatedTransactionId: resolveString(
        row,
        header.columns,
        "relatedTransactionId",
      ),
      counterparty,
      description,
      categoryRaw: resolveString(row, header.columns, "category"),
      paymentMethod,
      note: resolveString(row, header.columns, "note"),
      rawData: createRawData(header.headers, row),
    });
  }

  if (transactions.length === 0) {
    throw new WalletImportError(
      "NO_VALID_TRANSACTIONS",
      "The header was found, but no valid transactions could be imported. Review the row errors or export the statement again.",
    );
  }

  return {
    transactions,
    issues,
    headerRow: header.index + 1,
    rowsRead: matrix.length,
    rowsSkipped,
  };
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function fileExtension(fileName: string): string {
  const match = /\.([^.]+)$/u.exec(fileName.trim());
  return match?.[1]?.toLocaleLowerCase("en-US") ?? "";
}

function detectFormat(
  fileName: string,
  mimeType: string | undefined,
  bytes: Uint8Array,
): WalletFileFormat {
  const extension = fileExtension(fileName);

  if (extension === "pdf" || startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    throw new WalletImportError(
      "PDF_NOT_SUPPORTED",
      "PDF statements cannot be imported reliably. Export the statement as CSV (WeChat Pay or Alipay) or XLSX (WeChat Pay).",
    );
  }

  if (
    extension === "xls" ||
    startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  ) {
    throw new WalletImportError(
      "LEGACY_XLS_NOT_SUPPORTED",
      "Legacy .xls files are not supported. Open the statement and save it as .xlsx, or export it as CSV.",
    );
  }

  if (extension === "xlsm") {
    throw new WalletImportError(
      "MACRO_XLSX_NOT_SUPPORTED",
      "Macro-enabled .xlsm files are not accepted. Export a macro-free .xlsx or CSV statement.",
    );
  }

  if (extension === "xlsx") return "xlsx";
  if (extension === "csv") return "csv";

  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "xlsx";
  if (mimeType?.toLocaleLowerCase("en-US").includes("csv")) return "csv";

  throw new WalletImportError(
    "UNSUPPORTED_FILE_TYPE",
    "Unsupported statement file. Choose a .csv export, or an original WeChat Pay .xlsx export.",
  );
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/u, "");
  } catch {
    return null;
  }
}

function decodeGb18030(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("gb18030", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function providerScore(provider: WalletProvider, value: string): number {
  const normalized = value.normalize("NFKC");
  const commonHeaderScore =
    (normalized.includes("交易时间") ? 4 : 0) +
    (normalized.includes("交易创建时间") ? 4 : 0) +
    (normalized.includes("金额") ? 2 : 0) +
    (normalized.includes("收/支") ? 2 : 0);

  if (provider === "wechat") {
    return (
      commonHeaderScore +
      (/(?:微信支付|微信账单)/u.test(normalized) ? 12 : 0) +
      (normalized.includes("交易单号") ? 3 : 0) +
      (normalized.includes("当前状态") ? 2 : 0)
    );
  }

  return (
    commonHeaderScore +
    (/(?:支付宝|Alipay)/iu.test(normalized) ? 12 : 0) +
    (normalized.includes("交易号") ? 3 : 0) +
    (normalized.includes("成功退款") ? 2 : 0) +
    (normalized.includes("商家订单号") ? 2 : 0)
  );
}

function detectProviderFromName(fileName: string): WalletProvider | undefined {
  const normalized = fileName.normalize("NFKC").toLocaleLowerCase("en-US");
  if (/(?:微信|wechat|weixin)/u.test(normalized)) return "wechat";
  if (/(?:支付宝|alipay)/u.test(normalized)) return "alipay";
  return undefined;
}

function detectProviderFromContent(value: string): WalletProvider | undefined {
  const wechatScore = providerScore("wechat", value);
  const alipayScore = providerScore("alipay", value);

  if (wechatScore < 7 && alipayScore < 7) return undefined;
  if (wechatScore === alipayScore) return undefined;
  return wechatScore > alipayScore ? "wechat" : "alipay";
}

function chooseAlipayDecoding(bytes: Uint8Array): DecodedCsv {
  const candidates = [
    { text: decodeUtf8(bytes), encoding: "utf-8" as const },
    { text: decodeGb18030(bytes), encoding: "gb18030" as const },
  ].filter((candidate): candidate is DecodedCsv => candidate.text !== null);

  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      score: providerScore("alipay", candidate.text),
    }))
    .sort((left, right) => right.score - left.score);

  if (!ranked[0] || ranked[0].score < 7) {
    throw new WalletImportError(
      "INVALID_ENCODING",
      "Could not decode this Alipay CSV as UTF-8, GBK or GB18030. Export the statement again without opening or re-saving it.",
    );
  }

  return { text: ranked[0].text, encoding: ranked[0].encoding };
}

function decodeCsv(
  bytes: Uint8Array,
  fileName: string,
  providerOption: WalletProvider | undefined,
): { readonly decoded: DecodedCsv; readonly provider: WalletProvider } {
  const namedProvider = detectProviderFromName(fileName);
  const hintedProvider = providerOption ?? namedProvider;

  if (hintedProvider === "wechat") {
    const text = decodeUtf8(bytes);
    if (text === null) {
      throw new WalletImportError(
        "INVALID_ENCODING",
        "WeChat Pay CSV files must be UTF-8. Export the statement again without opening or re-saving it.",
      );
    }
    return { decoded: { text, encoding: "utf-8" }, provider: "wechat" };
  }

  if (hintedProvider === "alipay") {
    return { decoded: chooseAlipayDecoding(bytes), provider: "alipay" };
  }

  const utf8 = decodeUtf8(bytes);
  if (utf8 !== null) {
    const detected = detectProviderFromContent(utf8);
    if (detected === "wechat") {
      return {
        decoded: { text: utf8, encoding: "utf-8" },
        provider: "wechat",
      };
    }
    if (detected === "alipay") {
      return { decoded: chooseAlipayDecoding(bytes), provider: "alipay" };
    }
  }

  const gb18030 = decodeGb18030(bytes);
  if (gb18030 !== null && detectProviderFromContent(gb18030) === "alipay") {
    return {
      decoded: { text: gb18030, encoding: "gb18030" },
      provider: "alipay",
    };
  }

  throw new WalletImportError(
    "PROVIDER_NOT_DETECTED",
    "Could not identify this CSV as WeChat Pay or Alipay. Choose the provider explicitly and use an original statement export.",
  );
}

function delimiterOccurrences(line: string, delimiter: string): number {
  let occurrences = 0;
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      occurrences += 1;
    }
  }

  return occurrences;
}

function detectDelimiter(text: string): string {
  const candidates = [",", "\t", ";"];
  const relevantLine = text
    .split(/\r?\n/u, MAX_HEADER_SCAN_ROWS)
    .find((line) => /交易(?:创建)?时间/u.test(line));

  if (!relevantLine) return ",";

  return candidates
    .map((delimiter) => ({
      delimiter,
      count: delimiterOccurrences(relevantLine, delimiter),
    }))
    .sort((left, right) => right.count - left.count)[0].delimiter;
}

function parseCsv(text: string): Matrix {
  const result = Papa.parse<string[]>(text, {
    delimiter: detectDelimiter(text),
    skipEmptyLines: false,
  });

  const fatalError = result.errors.find(
    (error) => error.code === "MissingQuotes" || error.type === "Quotes",
  );
  if (fatalError) {
    throw new WalletImportError(
      "MALFORMED_CSV",
      `The CSV is malformed near row ${(fatalError.row ?? 0) + 1}. Export the statement again without editing it.`,
    );
  }

  return result.data;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimumOffset = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  return -1;
}

/** Rejects encrypted/oversized ZIP containers before XML decompression. */
function assertSafeXlsxArchive(bytes: Uint8Array): void {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    throw new WalletImportError(
      "INVALID_SPREADSHEET",
      "This file is not a valid .xlsx spreadsheet. Export it again from WeChat Pay.",
    );
  }

  const endOffset = findEndOfCentralDirectory(bytes);
  if (endOffset < 0) {
    throw new WalletImportError(
      "INVALID_SPREADSHEET",
      "This .xlsx spreadsheet is incomplete or corrupted. Export it again from WeChat Pay.",
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralDirectorySize = view.getUint32(endOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);

  if (
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff ||
    entryCount > MAX_XLSX_ENTRIES ||
    centralDirectoryOffset + centralDirectorySize > endOffset
  ) {
    throw new WalletImportError(
      "UNSAFE_SPREADSHEET",
      "This spreadsheet archive is too complex to import safely. Export a smaller statement as CSV.",
    );
  }

  let offset = centralDirectoryOffset;
  let totalCompressed = 0;
  let totalUncompressed = 0;

  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 46 > endOffset || view.getUint32(offset, true) !== 0x02014b50) {
      throw new WalletImportError(
        "INVALID_SPREADSHEET",
        "This .xlsx spreadsheet has a corrupted archive index. Export it again from WeChat Pay.",
      );
    }

    const flags = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);

    if ((flags & 0x0001) !== 0 || compressed === 0xffffffff || uncompressed === 0xffffffff) {
      throw new WalletImportError(
        "UNSAFE_SPREADSHEET",
        "Encrypted or ZIP64 spreadsheets cannot be imported safely. Export a regular .xlsx or CSV statement.",
      );
    }

    if (
      uncompressed > 1024 * 1024 &&
      (compressed === 0 || uncompressed / compressed > MAX_XLSX_ENTRY_COMPRESSION_RATIO)
    ) {
      throw new WalletImportError(
        "UNSAFE_SPREADSHEET",
        "This spreadsheet expands too much to import safely. Export a smaller date range as CSV.",
      );
    }

    totalCompressed += compressed;
    totalUncompressed += uncompressed;
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  if (
    totalUncompressed > MAX_XLSX_UNCOMPRESSED_BYTES ||
    (totalCompressed > 0 &&
      totalUncompressed / totalCompressed > MAX_XLSX_TOTAL_COMPRESSION_RATIO)
  ) {
    throw new WalletImportError(
      "UNSAFE_SPREADSHEET",
      "This spreadsheet is too large after decompression. Export a shorter date range as CSV.",
    );
  }
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

async function parseXlsx(
  bytes: Uint8Array,
  maxRows: number,
): Promise<Matrix> {
  assertSafeXlsxArchive(bytes);

  try {
    const sheets = await readXlsxFile(exactArrayBuffer(bytes), { trim: false });
    const totalRows = sheets.reduce((total, sheet) => total + sheet.data.length, 0);
    if (totalRows > maxRows) {
      throw new WalletImportError(
        "TOO_MANY_ROWS",
        `This workbook contains ${totalRows.toLocaleString("en-US")} rows; the limit is ${maxRows.toLocaleString("en-US")}. Export a shorter date range and try again.`,
      );
    }

    for (const sheet of sheets) {
      try {
        findHeader(sheet.data);
        return sheet.data;
      } catch (error) {
        if (!(error instanceof WalletImportError) || error.code !== "HEADER_NOT_FOUND") {
          throw error;
        }
      }
    }

    throw new WalletImportError(
      "HEADER_NOT_FOUND",
      "No worksheet contains the WeChat Pay transaction header. Export the workbook again without editing it.",
    );
  } catch (error) {
    if (error instanceof WalletImportError) throw error;
    throw new WalletImportError(
      "INVALID_SPREADSHEET",
      "The .xlsx spreadsheet could not be read. Export it again from WeChat Pay, or choose CSV instead.",
      error,
    );
  }
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("Import limits must be positive safe integers.");
  }
  return value;
}

async function readInput(input: WalletImportInput, maxFileBytes: number) {
  if (!("data" in input) && input.size !== undefined && input.size > maxFileBytes) {
    throw new WalletImportError(
      "FILE_TOO_LARGE",
      `This file is larger than the ${Math.floor(maxFileBytes / 1024 / 1024)} MB import limit. Export a shorter date range and try again.`,
    );
  }

  const data = "data" in input ? input.data : await input.arrayBuffer();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (bytes.byteLength === 0) {
    throw new WalletImportError("EMPTY_FILE", "The selected statement file is empty.");
  }

  if (bytes.byteLength > maxFileBytes) {
    throw new WalletImportError(
      "FILE_TOO_LARGE",
      `This file is larger than the ${Math.floor(maxFileBytes / 1024 / 1024)} MB import limit. Export a shorter date range and try again.`,
    );
  }

  return bytes;
}

export async function parseWalletExport(
  input: WalletImportInput,
  options: WalletImportOptions = {},
): Promise<WalletImportResult> {
  const maxFileBytes = normalizeLimit(
    options.maxFileBytes,
    DEFAULT_MAX_WALLET_FILE_BYTES,
  );
  const maxRows = normalizeLimit(options.maxRows, DEFAULT_MAX_WALLET_ROWS);
  const hasher = options.hasher ?? sha256Hex;
  const bytes = await readInput(input, maxFileBytes);
  const format = detectFormat(input.name, input.type, bytes);

  let provider: WalletProvider;
  let encoding: WalletTextEncoding | undefined;
  let matrix: Matrix;

  if (format === "csv") {
    const decodedCsv = decodeCsv(bytes, input.name, options.provider);
    provider = decodedCsv.provider;
    encoding = decodedCsv.decoded.encoding;
    matrix = parseCsv(decodedCsv.decoded.text);
  } else {
    if (options.provider === "alipay") {
      throw new WalletImportError(
        "UNSUPPORTED_FILE_TYPE",
        "Alipay spreadsheet imports are not supported. Export the Alipay statement as CSV.",
      );
    }
    matrix = await parseXlsx(bytes, maxRows);
    const contentPreview = matrix
      .slice(0, MAX_HEADER_SCAN_ROWS)
      .map((row) => row.map(cellToString).join(" "))
      .join("\n");
    provider =
      options.provider ??
      detectProviderFromName(input.name) ??
      detectProviderFromContent(contentPreview) ??
      "wechat";
  }

  const parsed = await parseMatrix(matrix, provider, maxRows, hasher);

  return {
    provider,
    format,
    encoding,
    ...parsed,
  };
}

export function getWalletFileFormat(
  fileName: string,
  mimeType: string | undefined,
  bytes: Uint8Array,
): WalletFileFormat {
  return detectFormat(fileName, mimeType, bytes);
}
