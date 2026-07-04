import type { Engagement, EngagementBillingPeriod, RenewalWindowBucket } from "./types";

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
