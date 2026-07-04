import { describe, it, expect } from "vitest";
import { scoreRenewalRiskFallback } from "../risk-scoring";

describe("scoreRenewalRiskFallback", () => {
  it("scores low risk for a recently touched engagement with no overdue tasks", () => {
    const result = scoreRenewalRiskFallback({
      lastTouchAt: "2026-06-28T00:00:00Z",
      today: "2026-07-04",
      renewalDate: "2026-12-01",
      recentSentiments: ["positive", "positive"],
      openOverdueTasks: 0,
    });
    expect(result.renewal_risk).toBe("low");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("scores high risk when renewal is near and there has been no recent touch", () => {
    const result = scoreRenewalRiskFallback({
      lastTouchAt: null,
      today: "2026-07-04",
      renewalDate: "2026-07-20",
      recentSentiments: [],
      openOverdueTasks: 2,
    });
    expect(result.renewal_risk).toBe("high");
  });

  it("scores high risk on negative sentiment even with a recent touch", () => {
    const result = scoreRenewalRiskFallback({
      lastTouchAt: "2026-07-01T00:00:00Z",
      today: "2026-07-04",
      renewalDate: "2027-01-01",
      recentSentiments: ["negative", "negative"],
      openOverdueTasks: 0,
    });
    expect(result.renewal_risk).toBe("high");
  });

  it("always returns a reasoning string and a next action", () => {
    const result = scoreRenewalRiskFallback({
      lastTouchAt: null,
      today: "2026-07-04",
      renewalDate: null,
      recentSentiments: [],
      openOverdueTasks: 0,
    });
    expect(result.risk_reasoning.length).toBeGreaterThan(0);
    expect(result.suggested_next_action.length).toBeGreaterThan(0);
    expect(result.health_score).toBeGreaterThanOrEqual(0);
    expect(result.health_score).toBeLessThanOrEqual(100);
  });
});
