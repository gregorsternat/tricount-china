import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";

import {
  SYNTHETIC_ALIPAY_CSV,
  SYNTHETIC_ALIPAY_HISTORICAL_CSV,
  SYNTHETIC_WECHAT_CSV,
  syntheticWechatXlsx,
  utf8FixtureBytes,
} from "./__fixtures__/synthetic-wallet-exports";
import {
  exportWalletTransactionsCsv,
  mergeWalletTransactions,
  neutralizeSpreadsheetFormula,
  parseWalletExport,
  sha256Hex,
  WALLET_IMPORT_PARSER_VERSION,
  WalletImportError,
  type WalletImportInput,
  type WalletTransaction,
} from ".";

function memoryFile(
  name: string,
  data: Uint8Array,
  type?: string,
): WalletImportInput {
  return { name, data, type };
}

async function expectImportError(
  promise: Promise<unknown>,
  code: WalletImportError["code"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: "WalletImportError",
    code,
  });
}

describe("parseWalletExport", () => {
  it("parses a BOM-prefixed WeChat CSV after a variable metadata preamble", async () => {
    const result = await parseWalletExport(
      memoryFile(
        "微信支付账单_合成测试.csv",
        utf8FixtureBytes(SYNTHETIC_WECHAT_CSV, true),
        "text/csv",
      ),
    );

    expect(result).toMatchObject({
      provider: "wechat",
      format: "csv",
      encoding: "utf-8",
      headerRow: 5,
    });
    expect(result.transactions).toHaveLength(4);
    expect(result.transactions[0]).toMatchObject({
      amountFen: 1_234,
      currency: "CNY",
      direction: "outflow",
      status: "completed",
      kind: "payment",
      occurredAt: "2026-08-02T08:05:06+08:00",
      timezone: "Asia/Shanghai",
      externalTransactionId: "WX-SYNTH-0001",
      parserVersion: WALLET_IMPORT_PARSER_VERSION,
    });
    expect(result.transactions[0].rawData["交易单号"]).toBe("WX-SYNTH-0001");
    expect(result.transactions[0].sourceId).toMatch(/^wechat_[a-f0-9]{32}$/u);
    expect(result.transactions[0].sourceId).not.toContain("WX-SYNTH");
    expect(result.transactions[0].fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.transactions[2]).toMatchObject({
      amountFen: 2_000,
      direction: "outflow",
      status: "refunded",
      isRefund: true,
    });
    expect(result.transactions[3]).toMatchObject({
      amountFen: 1_000,
      direction: "neutral",
      status: "pending",
    });
  });

  it.each(["gbk", "gb18030"] as const)(
    "decodes an Alipay %s CSV and models partial/full refunds",
    async (sourceEncoding) => {
      const source =
        sourceEncoding === "gb18030"
          ? SYNTHETIC_ALIPAY_CSV.replace("合成面馆", "𠀀合成面馆")
          : SYNTHETIC_ALIPAY_CSV;
      const bytes = new Uint8Array(iconv.encode(source, sourceEncoding));
      const result = await parseWalletExport(memoryFile("合成账单.csv", bytes));

      expect(result).toMatchObject({
        provider: "alipay",
        format: "csv",
        encoding: "gb18030",
        headerRow: 4,
      });
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0].counterparty).toBe(
        sourceEncoding === "gb18030" ? "𠀀合成面馆" : "合成面馆",
      );
      expect(result.transactions[1]).toMatchObject({
        amountFen: 8_000,
        refundAmountFen: 2_000,
        direction: "outflow",
        status: "partially_refunded",
        isRefund: true,
      });
      expect(result.transactions[2]).toMatchObject({
        amountFen: 4_000,
        refundAmountFen: 4_000,
        direction: "inflow",
        status: "refunded",
        kind: "refund",
        isRefund: true,
      });
    },
  );

  it("supports historical Alipay column aliases in UTF-8", async () => {
    const result = await parseWalletExport(
      memoryFile(
        "支付宝历史账单.csv",
        utf8FixtureBytes(SYNTHETIC_ALIPAY_HISTORICAL_CSV),
      ),
    );

    expect(result.encoding).toBe("utf-8");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      amountFen: 990,
      occurredAt: "2026-07-09T07:08:09+08:00",
      externalTransactionId: "ALI-HIST-001",
      merchantOrderId: "HIST-SHOP-1",
      status: "completed",
    });
  });

  it("parses a genuine macro-free WeChat XLSX container", async () => {
    const result = await parseWalletExport(
      memoryFile("wechat-synthetic.xlsx", syntheticWechatXlsx()),
    );

    expect(result).toMatchObject({
      provider: "wechat",
      format: "xlsx",
      headerRow: 4,
    });
    expect(result.encoding).toBeUndefined();
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      amountFen: 1_850,
      direction: "outflow",
      status: "completed",
      counterparty: "合成校园咖啡店",
      note: "仅供测试",
    });
  });

  it("keeps fingerprints stable when only the provider status changes", async () => {
    const pending = await parseWalletExport(
      memoryFile("wechat.csv", utf8FixtureBytes(SYNTHETIC_WECHAT_CSV)),
      { provider: "wechat" },
    );
    const completed = await parseWalletExport(
      memoryFile(
        "wechat.csv",
        utf8FixtureBytes(SYNTHETIC_WECHAT_CSV.replace("处理中", "支付成功")),
      ),
      { provider: "wechat" },
    );

    expect(completed.transactions[3].fingerprint).toBe(
      pending.transactions[3].fingerprint,
    );
    expect(completed.transactions[3].sourceId).toBe(
      pending.transactions[3].sourceId,
    );
  });

  it("returns row-scoped issues without copying private raw values into messages", async () => {
    const csv = [
      "微信支付账单明细",
      "交易时间,交易对方,收/支,金额(元),当前状态,交易单号",
      "not-a-date,合成私密对方,???,-,神秘状态,SYNTH-SECRET-ID",
      "2026-08-01 01:02:03,合成正常对方,???,1.00,神秘状态,SYNTH-VALID-ID",
    ].join("\n");
    const result = await parseWalletExport(
      memoryFile("wechat.csv", utf8FixtureBytes(csv)),
      { provider: "wechat" },
    );

    expect(result.transactions).toHaveLength(1);
    expect(result.issues.map(({ code }) => code)).toEqual([
      "INVALID_DATE",
      "UNKNOWN_DIRECTION",
      "UNKNOWN_STATUS",
    ]);
    expect(JSON.stringify(result.issues)).not.toContain("SYNTH-SECRET-ID");
    expect(JSON.stringify(result.issues)).not.toContain("合成私密对方");
  });

  it.each([
    ["statement.pdf", new TextEncoder().encode("%PDF-1.7"), "PDF_NOT_SUPPORTED"],
    [
      "statement.xls",
      Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      "LEGACY_XLS_NOT_SUPPORTED",
    ],
    ["statement.xlsm", Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), "MACRO_XLSX_NOT_SUPPORTED"],
  ] as const)("rejects unsafe/unsupported %s files", async (name, bytes, code) => {
    await expectImportError(parseWalletExport(memoryFile(name, bytes)), code);
  });

  it("enforces byte and row limits before importing", async () => {
    const bytes = utf8FixtureBytes(SYNTHETIC_WECHAT_CSV);

    await expectImportError(
      parseWalletExport(memoryFile("wechat.csv", bytes), {
        provider: "wechat",
        maxFileBytes: bytes.byteLength - 1,
      }),
      "FILE_TOO_LARGE",
    );
    await expectImportError(
      parseWalletExport(memoryFile("wechat.csv", bytes), {
        provider: "wechat",
        maxRows: 5,
      }),
      "TOO_MANY_ROWS",
    );
  });

  it("returns actionable errors for missing headers and malformed CSV", async () => {
    await expectImportError(
      parseWalletExport(
        memoryFile("wechat.csv", utf8FixtureBytes("not,a,wallet\n1,2,3")),
        { provider: "wechat" },
      ),
      "HEADER_NOT_FOUND",
    );

    const malformed = [
      "交易时间,交易对方,收/支,金额(元),当前状态",
      '"2026-08-01 00:00:00,合成商户,支出,10.00,支付成功',
    ].join("\n");
    await expectImportError(
      parseWalletExport(
        memoryFile("wechat.csv", utf8FixtureBytes(malformed)),
        { provider: "wechat" },
      ),
      "MALFORMED_CSV",
    );
  });
});

describe("wallet transaction identity and reconciliation", () => {
  it("creates deterministic non-plaintext SHA-256 fingerprints", async () => {
    const first = await sha256Hex("SYNTHETIC-PRIVATE-VALUE");
    const second = await sha256Hex("SYNTHETIC-PRIVATE-VALUE");

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(first).not.toContain("SYNTHETIC-PRIVATE-VALUE");
  });

  it("deduplicates exact rows and upgrades lifecycle status in place", async () => {
    const pendingResult = await parseWalletExport(
      memoryFile("wechat.csv", utf8FixtureBytes(SYNTHETIC_WECHAT_CSV)),
      { provider: "wechat" },
    );
    const pending = pendingResult.transactions[3];
    const completed: WalletTransaction = {
      ...pending,
      status: "completed",
      rawData: { ...pending.rawData, 当前状态: "支付成功" },
    };

    const exact = mergeWalletTransactions([pending], [pending]);
    expect(exact).toMatchObject({
      inserted: [],
      updated: [],
      conflicts: [],
    });
    expect(exact.duplicates).toEqual([pending]);

    const upgraded = mergeWalletTransactions([pending], [completed]);
    expect(upgraded.transactions).toHaveLength(1);
    expect(upgraded.transactions[0].status).toBe("completed");
    expect(upgraded.updated).toHaveLength(1);
    expect(upgraded.inserted).toHaveLength(0);

    const stale = mergeWalletTransactions([completed], [pending]);
    expect(stale.transactions[0].status).toBe("completed");
  });

  it("surfaces a source-ID collision instead of overwriting different data", async () => {
    const parsed = await parseWalletExport(
      memoryFile("wechat.csv", utf8FixtureBytes(SYNTHETIC_WECHAT_CSV)),
      { provider: "wechat" },
    );
    const current = parsed.transactions[0];
    const collision: WalletTransaction = {
      ...current,
      amountFen: current.amountFen + 1,
      fingerprint: "f".repeat(64),
    };

    const result = mergeWalletTransactions([current], [collision]);
    expect(result.conflicts).toEqual([
      { existing: current, incoming: collision, reason: "SOURCE_ID_COLLISION" },
    ]);
    expect(result.transactions).toEqual([current]);
  });

  it("does not collapse two provider-confirmed transactions with the same fingerprint", async () => {
    const parsed = await parseWalletExport(
      memoryFile("wechat.csv", utf8FixtureBytes(SYNTHETIC_WECHAT_CSV)),
      { provider: "wechat" },
    );
    const first = parsed.transactions[0];
    const second: WalletTransaction = {
      ...first,
      sourceId: "wechat_distinct_synthetic_id",
      externalTransactionId: "WX-SYNTH-DISTINCT",
    };

    const result = mergeWalletTransactions([first], [second]);
    expect(result.transactions).toEqual([first, second]);
    expect(result.inserted).toEqual([second]);
    expect(result.duplicates).toHaveLength(0);
  });
});

describe("safe normalized CSV export", () => {
  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", "\t=1+1"])(
    "neutralizes spreadsheet formula %s",
    (value) => {
      expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`);
    },
  );

  it("escapes provider-controlled text in exported rows", async () => {
    const parsed = await parseWalletExport(
      memoryFile("wechat.csv", utf8FixtureBytes(SYNTHETIC_WECHAT_CSV)),
      { provider: "wechat" },
    );
    const dangerous: WalletTransaction = {
      ...parsed.transactions[0],
      counterparty: "=HYPERLINK(\"https://example.invalid\")",
      note: "+synthetic",
    };
    const csv = exportWalletTransactionsCsv([dangerous]);

    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+synthetic");
  });
});
