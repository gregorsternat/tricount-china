export const DASHBOARD_TIME_ZONE = "Asia/Shanghai";

export interface CalendarMonthPeriod {
  readonly key: string;
  readonly from: Date;
  readonly to: Date;
  readonly startsOn: string;
  readonly endsOn: string;
}

export function isMonthKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const [year] = value.split("-").map(Number);
  return year >= 2000 && year <= 2100;
}

export function monthPeriod(month: string): CalendarMonthPeriod {
  if (!isMonthKey(month)) throw new Error("Invalid calendar month.");

  const [year, monthNumber] = month.split("-").map(Number);
  const next = monthNumber === 12
    ? `${year + 1}-01`
    : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
  const from = new Date(`${month}-01T00:00:00+08:00`);
  const nextStart = new Date(`${next}-01T00:00:00+08:00`);
  const to = new Date(nextStart.getTime() - 1);

  return {
    key: month,
    from,
    to,
    startsOn: `${month}-01`,
    endsOn: isoDate(to),
  };
}

export function currentMonthKey(now = new Date()): string {
  return isoDate(now).slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  if (!isMonthKey(month)) throw new Error("Invalid calendar month.");
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthKeysEndingAt(month: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 1) return [];
  return Array.from({ length: count }, (_, index) =>
    shiftMonth(month, index - count + 1),
  );
}

export function isoDate(date: Date, timezone = DASHBOARD_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dayCount(month: string): number {
  return Number(monthPeriod(month).endsOn.slice(-2));
}
