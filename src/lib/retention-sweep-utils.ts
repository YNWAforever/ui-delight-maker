export type RenewalBoundary = "90" | "60" | "30" | "overdue";

function daysBetween(from: string, to: string): number {
  return Math.floor((new Date(from).getTime() - new Date(to).getTime()) / (1000 * 60 * 60 * 24));
}

export function getBoundaryCrossed(
  renewalDate: string | null,
  today: string,
): RenewalBoundary | null {
  if (!renewalDate) return null;
  const daysUntil = daysBetween(renewalDate, today);
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= 30) return "30";
  if (daysUntil <= 60) return "60";
  if (daysUntil <= 90) return "90";
  return null;
}

export function isEngagementStale(input: {
  lastTouchAt: string | null;
  startDate: string;
  today: string;
}): boolean {
  const anchor = input.lastTouchAt ?? input.startDate;
  return daysBetween(input.today, anchor) >= 30;
}

export function buildRenewalWindowDedupeKey(
  engagementId: string,
  boundary: RenewalBoundary,
  renewalDate: string,
): string {
  return `renewal_window:${engagementId}:${boundary}:${renewalDate}`;
}

export function buildStaleTouchpointDedupeKey(
  engagementId: string,
  episodeAnchor: string | null,
): string {
  return `stale_touchpoint:${engagementId}:${episodeAnchor ?? "never"}`;
}
