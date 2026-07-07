import type { RenewalRisk } from "./types";

export type RiskScoringInput = {
  lastTouchAt: string | null;
  today: string;
  renewalDate: string | null;
  recentSentiments: Array<"positive" | "neutral" | "negative">;
  openOverdueTasks: number;
};

export type RiskScoringResult = {
  health_score: number;
  renewal_risk: RenewalRisk;
  risk_reasoning: string;
  suggested_next_action: string;
  confidence: number;
};

function daysSince(dateIso: string | null, today: string): number | null {
  if (!dateIso) return null;
  return Math.floor(
    (new Date(today).getTime() - new Date(dateIso).getTime()) / (1000 * 60 * 60 * 24),
  );
}

function daysUntil(dateIso: string | null, today: string): number | null {
  if (!dateIso) return null;
  return Math.floor(
    (new Date(dateIso).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function scoreRenewalRiskFallback(input: RiskScoringInput): RiskScoringResult {
  let score = 70;
  const reasons: string[] = [];

  const sinceTouch = daysSince(input.lastTouchAt, input.today);
  if (sinceTouch === null || sinceTouch > 30) {
    score -= 25;
    reasons.push(
      sinceTouch === null ? "no touchpoint on record" : `${sinceTouch} days since last touch`,
    );
  } else if (sinceTouch <= 14) {
    score += 5;
  }

  const negativeCount = input.recentSentiments.filter((s) => s === "negative").length;
  if (negativeCount > 0) {
    score -= 20 * negativeCount;
    reasons.push(`${negativeCount} recent negative touchpoint(s)`);
  }
  const positiveCount = input.recentSentiments.filter((s) => s === "positive").length;
  if (positiveCount > 0 && negativeCount === 0) {
    score += 5;
  }

  if (input.openOverdueTasks > 0) {
    score -= 10 * Math.min(input.openOverdueTasks, 3);
    reasons.push(`${input.openOverdueTasks} overdue task(s)`);
  }

  const untilRenewal = daysUntil(input.renewalDate, input.today);
  if (untilRenewal !== null && untilRenewal <= 30 && (sinceTouch === null || sinceTouch > 14)) {
    score -= 15;
    reasons.push("renewal within 30 days without a recent touch");
  }

  score = Math.max(0, Math.min(100, score));

  const renewal_risk: RenewalRisk = score < 40 ? "high" : score < 65 ? "medium" : "low";
  const suggested_next_action =
    renewal_risk === "high"
      ? "Schedule an urgent check-in before renewal"
      : renewal_risk === "medium"
        ? "Schedule a check-in this month"
        : "Maintain regular cadence";

  return {
    health_score: score,
    renewal_risk,
    risk_reasoning:
      reasons.length > 0
        ? `Deterministic staging fallback: ${reasons.join("; ")}.`
        : "Deterministic staging fallback: no risk signals detected.",
    suggested_next_action,
    confidence: 0.6,
  };
}
