// SSR-safe formatters. Fixed locale + UTC so server and client render identically.

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const COUNT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const COMPACT_COUNT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

const parseDate = (value: string | Date | null | undefined): Date | null => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateTime = (value: string | Date | null | undefined) => {
  const date = parseDate(value);
  return date ? `${DATE.format(date)}, ${TIME.format(date)}` : "—";
};

export const formatDate = (value: string | Date | null | undefined) => {
  const date = parseDate(value);
  return date ? DATE.format(date) : "—";
};

export const formatTime = (value: string | Date | null | undefined) => {
  const date = parseDate(value);
  return date ? TIME.format(date) : "—";
};

export const formatPercent = (value: number | null | undefined) =>
  value == null ? "—" : `${Math.round(value * 100)}%`;

export const formatCount = (value: number | null | undefined) => COUNT.format(value ?? 0);

export const formatCurrencyAmount = (
  value: number | null | undefined,
  currency: string | null | undefined = "HKD",
) => `${currency ?? "HKD"} ${COUNT.format(value ?? 0)}`;

export const formatHKD = (n: number | null | undefined) => formatCurrencyAmount(n, "HKD");

export const formatCompactHKD = (n: number | null | undefined) =>
  `HKD ${COMPACT_COUNT.format(n ?? 0)}`;

export const relativeTime = (iso: string) => {
  // Deterministic relative against a fixed "now" so SSR matches CSR.
  const NOW = new Date("2026-05-20T10:00:00Z").getTime();
  const t = new Date(iso).getTime();
  const diff = Math.round((t - NOW) / 1000);
  const abs = Math.abs(diff);
  const sign = diff < 0 ? "ago" : "from now";
  if (abs < 60) return `${abs}s ${sign}`;
  if (abs < 3600) return `${Math.round(abs / 60)}m ${sign}`;
  if (abs < 86400) return `${Math.round(abs / 3600)}h ${sign}`;
  return `${Math.round(abs / 86400)}d ${sign}`;
};
