import { describe, it, expect } from "vitest";
import {
  getBoundaryCrossed,
  isEngagementStale,
  buildRenewalWindowDedupeKey,
  buildStaleTouchpointDedupeKey,
} from "../retention-sweep-utils";

describe("getBoundaryCrossed", () => {
  it("returns overdue for a past renewal date", () => {
    expect(getBoundaryCrossed("2026-06-01", "2026-07-04")).toBe("overdue");
  });
  it("returns 30 within the 30-day window", () => {
    expect(getBoundaryCrossed("2026-07-25", "2026-07-04")).toBe("30");
  });
  it("returns 60 within the 60-day window", () => {
    expect(getBoundaryCrossed("2026-08-25", "2026-07-04")).toBe("60");
  });
  it("returns 90 within the 90-day window", () => {
    expect(getBoundaryCrossed("2026-09-25", "2026-07-04")).toBe("90");
  });
  it("returns null beyond 90 days", () => {
    expect(getBoundaryCrossed("2027-01-01", "2026-07-04")).toBeNull();
  });
  it("returns null for no renewal date", () => {
    expect(getBoundaryCrossed(null, "2026-07-04")).toBeNull();
  });
});

describe("isEngagementStale", () => {
  it("is stale when never touched and started 30+ days ago", () => {
    expect(
      isEngagementStale({ lastTouchAt: null, startDate: "2026-06-01", today: "2026-07-04" }),
    ).toBe(true);
  });
  it("is not stale when never touched but started recently", () => {
    expect(
      isEngagementStale({ lastTouchAt: null, startDate: "2026-06-30", today: "2026-07-04" }),
    ).toBe(false);
  });
  it("is stale after 30+ days since last touch", () => {
    expect(
      isEngagementStale({
        lastTouchAt: "2026-06-01T00:00:00Z",
        startDate: "2026-01-01",
        today: "2026-07-04",
      }),
    ).toBe(true);
  });
  it("is not stale within 30 days of last touch", () => {
    expect(
      isEngagementStale({
        lastTouchAt: "2026-06-20T00:00:00Z",
        startDate: "2026-01-01",
        today: "2026-07-04",
      }),
    ).toBe(false);
  });
});

describe("dedupe key builders", () => {
  it("builds a renewal window key scoped to engagement, boundary, and renewal date", () => {
    expect(buildRenewalWindowDedupeKey("eng-1", "30", "2026-07-25")).toBe(
      "renewal_window:eng-1:30:2026-07-25",
    );
  });
  it("builds a stale touchpoint key scoped to engagement and the episode anchor", () => {
    expect(buildStaleTouchpointDedupeKey("eng-1", "2026-06-01T00:00:00Z")).toBe(
      "stale_touchpoint:eng-1:2026-06-01T00:00:00Z",
    );
    expect(buildStaleTouchpointDedupeKey("eng-1", null)).toBe("stale_touchpoint:eng-1:never");
  });
});
