// SSR-safe formatters. Fixed locale + UTC so server and client render identically.

const DATETIME = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

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

export const formatDateTime = (iso: string) => DATETIME.format(new Date(iso));
export const formatDate = (iso: string) => DATE.format(new Date(iso));
export const formatTime = (iso: string) => TIME.format(new Date(iso));

export const formatHKD = (n: number) =>
  `HKD ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export const formatCompactHKD = (n: number) => {
  if (n >= 1_000_000) return `HKD ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `HKD ${(n / 1_000).toFixed(0)}K`;
  return `HKD ${n}`;
};

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
