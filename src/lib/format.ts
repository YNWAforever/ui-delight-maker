// SSR-safe formatters. Fixed locale and explicit business time zone on both server and client.
import { formatCommercialMoney } from "@/lib/money";
export { formatCommercialMoney, formatCurrencyTotals } from "@/lib/money";

const BUSINESS_TIME_ZONE = "Asia/Hong_Kong";

const dateFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone,
  });

const timeFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });

const DATE = dateFormatter(BUSINESS_TIME_ZONE);
const TIME = timeFormatter(BUSINESS_TIME_ZONE);
const DATE_ONLY = dateFormatter("UTC");

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

export const formatDateTime = (
  value: string | Date | null | undefined,
  options: { timeZone?: string } = {},
) => {
  const date = parseDate(value);
  if (!date) return "—";
  const datePart = options.timeZone
    ? dateFormatter(options.timeZone).format(date)
    : DATE.format(date);
  const timePart = options.timeZone
    ? timeFormatter(options.timeZone).format(date)
    : TIME.format(date);
  return `${datePart}, ${timePart}`;
};

/** A YYYY-MM-DD calendar value is never converted to an instant in the business zone. */
export const formatDateOnly = (value: string | null | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "—";
  return DATE_ONLY.format(date);
};

export const formatDate = (value: string | Date | null | undefined) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDateOnly(value);
  }
  const date = parseDate(value);
  return date ? DATE.format(date) : "—";
};

export const formatTime = (value: string | Date | null | undefined) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  const date = parseDate(value);
  return date ? TIME.format(date) : "—";
};

export const formatPercent = (value: number | null | undefined) =>
  value == null ? "—" : `${Math.round(value * 100)}%`;

const PERCENT_POINTS = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/**
 * A number that is *already* in percentage points, e.g. 12.5 -> "12.5%".
 *
 * Distinct from `formatPercent`, which takes a 0-1 ratio and multiplies. Report and agent
 * reads return rates the database already rounded to one decimal (`round(100.0 * … , 1)`),
 * and pushing those through `formatPercent` would either multiply them by a hundred again
 * or throw the decimal away.
 */
export const formatPercentPoints = (value: number | null | undefined) =>
  value == null ? "—" : `${PERCENT_POINTS.format(value)}%`;

export const formatCount = (value: number | null | undefined) => COUNT.format(value ?? 0);

export const formatCurrencyAmount = (
  value: number | string | null | undefined,
  currency: string | null | undefined = "HKD",
) => formatCommercialMoney(value, currency);

export const formatHKD = (n: number | null | undefined) => formatCurrencyAmount(n, "HKD");

export const formatCompactHKD = (n: number | null | undefined) =>
  `HKD ${COMPACT_COUNT.format(n ?? 0)}`;

/**
 * Relative time against an explicit `now`.
 *
 * `now` is a parameter rather than a call to Date.now() inside, because the server and the
 * first client render must produce identical markup or React reports a hydration mismatch.
 * That is why this previously pinned a hard-coded "now" — which kept SSR and CSR in
 * agreement but froze every timestamp at 2026-05-20, so by mid-2026 the app was telling
 * users a notification from an hour ago arrived two months in the future.
 *
 * Callers rendering this in a component should take `now` from useClientNow(), which is
 * null until after mount and so keeps the hydration render stable.
 */
export const relativeTime = (iso: string, now: number) => {
  const NOW = now;
  const t = new Date(iso).getTime();
  const diff = Math.round((t - NOW) / 1000);
  const abs = Math.abs(diff);
  const sign = diff < 0 ? "ago" : "from now";
  // A fetch that just finished read "Updated 0s from now" on every page (UX-18).
  if (abs < 10) return "just now";
  if (abs < 60) return `${abs}s ${sign}`;
  if (abs < 3600) return `${Math.round(abs / 60)}m ${sign}`;
  if (abs < 86400) return `${Math.round(abs / 3600)}h ${sign}`;
  return `${Math.round(abs / 86400)}d ${sign}`;
};
