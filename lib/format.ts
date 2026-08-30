const cnyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const eurFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCnyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCny(fen: number, compact = false) {
  return (compact ? compactCnyFormatter : cnyFormatter).format(fen / 100);
}

export function formatEurFromFen(fen: number, cnyToEur: number) {
  return eurFormatter.format((fen / 100) * cnyToEur);
}

export function parseAmountToFen(input: string) {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("fr") ?? "")
    .join("");
}

export function formatShortDate(date: string) {
  const parsedDate = date.length === 10 ? new Date(`${date}T12:00:00+08:00`) : new Date(date);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Shanghai",
  }).format(parsedDate);
}

export function todayInShanghai() {
  return new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date());
}
