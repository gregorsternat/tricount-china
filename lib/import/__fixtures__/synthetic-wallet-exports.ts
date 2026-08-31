/** Every value in these fixtures is invented and contains no real account data. */

export const SYNTHETIC_WECHAT_CSV = [
  "微信支付账单明细",
  "微信昵称：[合成测试用户]",
  "起始时间：2026-08-01 00:00:00    终止时间：2026-08-31 23:59:59",
  "",
  "交易时间,交易类型,交易对方,商品,收/支,金额（元）,支付方式,当前状态,交易单号,商户单号,备注",
  '2026-08-02 08:05:06,商户消费,合成校园食堂,"早餐, 套餐",支出,¥12.34,零钱,支付成功,WX-SYNTH-0001,M-SYNTH-101,',
  "2026-08-03 10:00:00,转账,合成测试同学,生活费,收入,100.00,银行卡,已收钱,WX-SYNTH-0002,,合成数据",
  "2026-08-04 18:30:00,商户消费,合成书店,教材,支出,20.00,零钱,已全额退款,WX-SYNTH-0003,M-SYNTH-103,",
  "2026-08-05 09:30:00,其他,合成服务商,保证金,不计收支,10,零钱,处理中,WX-SYNTH-0004,M-SYNTH-104,",
].join("\r\n");

export const SYNTHETIC_ALIPAY_CSV = [
  "支付宝交易记录明细查询",
  "账户：[synthetic@example.invalid]",
  "---------------------------------",
  "交易时间,交易分类,交易对方,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,成功退款（元）,备注",
  "2026-08-10 12:10:00,餐饮美食,合成面馆,午餐,支出,25.60,余额,交易成功,ALI-SYNTH-001,SHOP-SYNTH-1,0.00,",
  "2026-08-11 14:20:00,日用百货,合成超市,生活用品,支出,80.00,银行卡,交易成功,ALI-SYNTH-002,SHOP-SYNTH-2,20.00,部分商品退回",
  "2026-08-12 09:00:00,退款,合成票务,订单退款,不计收支,40.00,余额,退款成功,ALI-SYNTH-003,SHOP-SYNTH-3,40.00,",
].join("\r\n");

export const SYNTHETIC_ALIPAY_HISTORICAL_CSV = [
  "支付宝交易记录明细查询",
  "",
  "交易号,商家订单号,交易创建时间,付款时间,类型,交易对方,商品名称,金额（元）,收/支,交易状态,服务费（元）,成功退款（元）,备注,资金状态",
  "ALI-HIST-001,HIST-SHOP-1,2026/07/09 07:08:09,2026/07/09 07:09:00,即时到账交易,合成早餐店,早餐,9.90,支出,交易成功,0,0,,已支出",
].join("\n");

export function utf8FixtureBytes(text: string, withBom = false): Uint8Array {
  const contents = new TextEncoder().encode(text);
  if (!withBom) return contents;

  const result = new Uint8Array(contents.length + 3);
  result.set([0xef, 0xbb, 0xbf]);
  result.set(contents, 3);
  return result;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function columnName(index: number): string {
  let result = "";
  let value = index + 1;
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function worksheetXml(rows: readonly (readonly string[])[]): string {
  const xmlRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          if (!value) return "";
          const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
          return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows}</sheetData></worksheet>`;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

function joinBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function createStoredZip(files: Readonly<Record<string, string>>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const [name, contents] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const contentsBytes = encoder.encode(contents);
    const checksum = crc32(contentsBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, contentsBytes.length);
    writeUint32(localView, 22, contentsBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, contentsBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, contentsBytes.length);
    writeUint32(centralView, 24, contentsBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint32(centralView, 42, localOffset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    localOffset += localHeader.length + contentsBytes.length;
  }

  const localData = joinBytes(localParts);
  const centralData = joinBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  const entryCount = Object.keys(files).length;
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 8, entryCount);
  writeUint16(endView, 10, entryCount);
  writeUint32(endView, 12, centralData.length);
  writeUint32(endView, 16, localData.length);

  return joinBytes([localData, centralData, end]);
}

/** Builds a tiny real XLSX archive without relying on a spreadsheet writer. */
export function syntheticWechatXlsx(): Uint8Array {
  const rows = [
    ["微信支付账单明细"],
    ["微信昵称：[合成测试用户]"],
    [],
    [
      "交易时间",
      "交易类型",
      "交易对方",
      "商品",
      "收/支",
      "金额（元）",
      "支付方式",
      "当前状态",
      "交易单号",
      "商户单号",
      "备注",
    ],
    [
      "2026-08-20 11:12:13",
      "商户消费",
      "合成校园咖啡店",
      "咖啡",
      "支出",
      "18.50",
      "零钱",
      "支付成功",
      "WX-XLSX-SYNTH-1",
      "M-XLSX-SYNTH-1",
      "仅供测试",
    ],
  ];

  return createStoredZip({
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="微信账单" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml":
      '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font/></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml": worksheetXml(rows),
  });
}
