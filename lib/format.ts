import {
  DEFAULT_LOCALE,
  getIntlLocale,
  type Locale,
} from "@/lib/i18n/config";

export const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

export function formatCny(
  fen: number,
  compact = false,
  locale: Locale = DEFAULT_LOCALE,
) {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 0 : 2,
  }).format(fen / 100);
}

export function formatEurFromFen(
  fen: number,
  cnyToEur: number,
  locale: Locale = DEFAULT_LOCALE,
) {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((fen / 100) * cnyToEur);
}

export function formatNumber(
  value: number,
  locale: Locale = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(getIntlLocale(locale), options).format(value);
}

export function formatPercent(
  value: number,
  locale: Locale = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 1,
    ...options,
  }).format(value);
}

export function parseAmountToFen(input: string) {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export function initials(name: string, locale: Locale = DEFAULT_LOCALE) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase(getIntlLocale(locale)) ?? "")
    .join("");
}

export function formatShortDate(
  date: string,
  locale: Locale = DEFAULT_LOCALE,
  timeZone = SHANGHAI_TIME_ZONE,
) {
  const parsedDate =
    date.length === 10 ? new Date(`${date}T12:00:00+08:00`) : new Date(date);
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(parsedDate);
}

export function formatDateTime(
  date: string | Date,
  locale: Locale = DEFAULT_LOCALE,
  timeZone = SHANGHAI_TIME_ZONE,
) {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(typeof date === "string" ? new Date(date) : date);
}

export function formatMonthKey(
  monthKey: string,
  locale: Locale = DEFAULT_LOCALE,
  format: "short" | "long" = "short",
) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    month: format,
    timeZone: "UTC",
  }).format(date);
}

export function todayInShanghai(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: SHANGHAI_TIME_ZONE,
  }).formatToParts(referenceDate);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
