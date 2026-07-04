import { describe, it, expect } from "vitest";
import { annualizeValue, rollupClientStats, getRenewalWindow } from "../engagement-utils";
import type { Engagement } from "../types";

function engagement(overrides: Partial<Engagement>): Engagement {
  return {
    id: "e1",
    client_id: "c1",
    product_id: "p1",
    owner: null,
    value: 10000,
    billing_period: "monthly",
    start_date: "2026-01-01",
    renewal_date: "2026-12-31",
    status: "active",
    health_score: 80,
    renewal_risk: "low",
    risk_reasoning: null,
    next_action: null,
    last_touch_at: null,
    end_reason: null,
    lead_id: null,
    quote_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("annualizeValue", () => {
  it("multiplies monthly by 12", () => {
    expect(annualizeValue(10000, "monthly")).toBe(120000);
  });
  it("multiplies quarterly by 4", () => {
    expect(annualizeValue(10000, "quarterly")).toBe(40000);
  });
  it("keeps annual as-is", () => {
    expect(annualizeValue(120000, "annual")).toBe(120000);
  });
  it("excludes one_off from ARR (returns 0)", () => {
    expect(annualizeValue(50000, "one_off")).toBe(0);
  });
  it("treats null value as 0", () => {
    expect(annualizeValue(null, "monthly")).toBe(0);
  });
});

describe("rollupClientStats", () => {
  it("sums annualized value across active engagements only", () => {
    const stats = rollupClientStats([
      engagement({ value: 10000, billing_period: "monthly", status: "active" }),
      engagement({ id: "e2", value: 50000, billing_period: "one_off", status: "active" }),
      engagement({ id: "e3", value: 999999, billing_period: "annual", status: "ended" }),
    ]);
    expect(stats.arr).toBe(120000);
  });

  it("uses the minimum health score across active engagements", () => {
    const stats = rollupClientStats([
      engagement({ health_score: 80, status: "active" }),
      engagement({ id: "e2", health_score: 40, status: "active" }),
      engagement({ id: "e3", health_score: 5, status: "ended" }),
    ]);
    expect(stats.healthScore).toBe(40);
  });

  it("uses the nearest upcoming renewal across active engagements", () => {
    const stats = rollupClientStats([
      engagement({ renewal_date: "2026-12-31", status: "active" }),
      engagement({ id: "e2", renewal_date: "2026-08-15", status: "active" }),
      engagement({ id: "e3", renewal_date: "2026-01-01", status: "ended" }),
    ]);
    expect(stats.renewalDate).toBe("2026-08-15");
  });

  it("returns zeroed defaults for a client with no active engagements", () => {
    const stats = rollupClientStats([engagement({ status: "ended" })]);
    expect(stats).toEqual({ arr: 0, healthScore: 50, renewalDate: null });
  });
});

describe("getRenewalWindow", () => {
  it("buckets overdue renewals", () => {
    expect(getRenewalWindow("2026-06-01", "2026-07-04")).toBe("overdue");
  });
  it("buckets within 30 days", () => {
    expect(getRenewalWindow("2026-07-20", "2026-07-04")).toBe("30");
  });
  it("buckets within 60 days", () => {
    expect(getRenewalWindow("2026-08-25", "2026-07-04")).toBe("60");
  });
  it("buckets within 90 days", () => {
    expect(getRenewalWindow("2026-09-20", "2026-07-04")).toBe("90");
  });
  it("buckets beyond 90 days as later", () => {
    expect(getRenewalWindow("2027-01-01", "2026-07-04")).toBe("later");
  });
  it("buckets null renewal date as later", () => {
    expect(getRenewalWindow(null, "2026-07-04")).toBe("later");
  });
});
