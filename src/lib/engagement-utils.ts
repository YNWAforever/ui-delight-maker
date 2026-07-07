import type { Engagement, EngagementBillingPeriod, RenewalWindowBucket } from "./types";

/**
 * Adds a whole number of months to a "YYYY-MM-DD" date string, clamping the
 * day-of-month to the target month's last day when it would otherwise
 * overflow (e.g. 2026-01-31 + 1 month -> 2026-02-28, not 2026-03-03).
 *
 * Used to derive a default renewal_date from an engagement's start_date and
 * its product's default_term_months, both for new engagements created via
 * CSV import (commitClientImport) and via won-lead conversion
 * (WonConversionDialog's auto-filled default).
 */
export function addMonthsToDateString(dateString: string, months: number): string {
  const [year, month, day] = dateString.split("-").map(Number);

  // Month is 0-indexed for Date, so "day 0" of (month + months + 1) is the
  // last day of the target month — this lets us clamp overflowing days
  // (e.g. Jan 31 + 1 month) without manually tracking month lengths.
  const targetMonthIndex = month - 1 + months;
  const lastDayOfTargetMonth = new Date(year, targetMonthIndex + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  const result = new Date(year, targetMonthIndex, clampedDay);

  const yyyy = result.getFullYear();
  const mm = String(result.getMonth() + 1).padStart(2, "0");
  const dd = String(result.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function annualizeValue(
  value: number | null,
  billingPeriod: EngagementBillingPeriod,
): number {
  if (value === null) return 0;
  switch (billingPeriod) {
    case "monthly":
      return value * 12;
    case "quarterly":
      return value * 4;
    case "annual":
      return value;
    case "one_off":
      return 0;
  }
}

export function rollupClientStats(engagements: Engagement[]): {
  arr: number;
  healthScore: number;
  renewalDate: string | null;
} {
  const active = engagements.filter((e) => e.status === "active");

  if (active.length === 0) {
    return { arr: 0, healthScore: 50, renewalDate: null };
  }

  const arr = active.reduce((sum, e) => sum + annualizeValue(e.value, e.billing_period), 0);
  const healthScore = Math.min(...active.map((e) => e.health_score));
  const renewalDates = active.map((e) => e.renewal_date).filter((d): d is string => d !== null);
  const renewalDate = renewalDates.length > 0 ? renewalDates.sort()[0] : null;

  return { arr, healthScore, renewalDate };
}

export function getRenewalWindow(renewalDate: string | null, today: string): RenewalWindowBucket {
  if (!renewalDate) return "later";

  const daysUntil = Math.floor(
    (new Date(renewalDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysUntil < 0) return "overdue";
  if (daysUntil <= 30) return "30";
  if (daysUntil <= 60) return "60";
  if (daysUntil <= 90) return "90";
  return "later";
}
