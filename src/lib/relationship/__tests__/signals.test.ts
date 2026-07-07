import { describe, expect, it } from "vitest";

import { buildRelationshipSignals } from "../signals";

const now = new Date("2026-07-08T00:00:00.000Z");

describe("buildRelationshipSignals", () => {
  it("flags missing decision maker and champion", () => {
    const signals = buildRelationshipSignals({
      account: { id: "a1", name: "Fimmick", lifecycle_stage: "active_client", account_owner: "u1" },
      contacts: [
        {
          id: "c1",
          relationship_role: "daily_user",
          influence_level: "medium",
          sentiment: "neutral",
          last_contacted_at: "2026-07-01T00:00:00.000Z",
        },
      ],
      engagements: [],
      quotes: [],
      campaignMembers: [],
      products: [],
      now,
    });

    expect(signals.map((signal) => signal.signal_type)).toEqual([
      "missing_decision_maker",
      "missing_champion",
    ]);
  });

  it("flags post-event follow-up after three business days", () => {
    const signals = buildRelationshipSignals({
      account: { id: "a1", name: "Acme", lifecycle_stage: "prospect", account_owner: "u1" },
      contacts: [
        {
          id: "c1",
          relationship_role: "decision_maker",
          influence_level: "high",
          sentiment: "positive",
          last_contacted_at: null,
        },
      ],
      engagements: [],
      quotes: [],
      campaignMembers: [
        {
          id: "m1",
          campaign_id: "camp1",
          attendee_status: "attended",
          follow_up_status: "not_started",
          created_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      products: [],
      now,
    });

    expect(signals).toContainEqual(
      expect.objectContaining({
        signal_type: "post_event_follow_up_due",
        severity: "high",
      }),
    );
  });

  it("does not flag post-event follow-up before three business days when a weekend intervenes", () => {
    const weekendBoundaryNow = new Date("2026-07-06T00:00:00.000Z");

    const signals = buildRelationshipSignals({
      account: { id: "a1", name: "Acme", lifecycle_stage: "prospect", account_owner: "u1" },
      contacts: [
        {
          id: "c1",
          relationship_role: "decision_maker",
          influence_level: "high",
          sentiment: "positive",
          last_contacted_at: null,
        },
      ],
      engagements: [],
      quotes: [],
      campaignMembers: [
        {
          id: "m1",
          campaign_id: "camp1",
          attendee_status: "attended",
          follow_up_status: "not_started",
          created_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      products: [],
      now: weekendBoundaryNow,
    });

    expect(signals.map((signal) => signal.signal_type)).not.toContain("post_event_follow_up_due");
  });

  it("ignores invalid legacy attendee statuses for post-event follow-up", () => {
    const signals = buildRelationshipSignals({
      account: { id: "a1", name: "Acme", lifecycle_stage: "prospect", account_owner: "u1" },
      contacts: [
        {
          id: "c1",
          relationship_role: "decision_maker",
          influence_level: "high",
          sentiment: "positive",
          last_contacted_at: null,
        },
      ],
      engagements: [],
      quotes: [],
      campaignMembers: [
        {
          id: "m1",
          campaign_id: "camp1",
          attendee_status: "opened" as never,
          follow_up_status: "not_started",
          created_at: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "m2",
          campaign_id: "camp1",
          attendee_status: "sent" as never,
          follow_up_status: "not_started",
          created_at: "2026-07-01T00:00:00.000Z",
        },
      ],
      products: [],
      now,
    });

    expect(signals.map((signal) => signal.signal_type)).not.toContain("post_event_follow_up_due");
  });

  it("suggests cross-sell when active account uses only one product", () => {
    const signals = buildRelationshipSignals({
      account: { id: "a1", name: "Acme", lifecycle_stage: "active_client", account_owner: "u1" },
      contacts: [
        {
          id: "c1",
          relationship_role: "decision_maker",
          influence_level: "high",
          sentiment: "positive",
          last_contacted_at: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "c2",
          relationship_role: "champion",
          influence_level: "medium",
          sentiment: "positive",
          last_contacted_at: "2026-07-01T00:00:00.000Z",
        },
      ],
      engagements: [
        {
          id: "e1",
          product_id: "p1",
          status: "active",
          renewal_risk: "low",
          last_touch_at: "2026-07-01T00:00:00.000Z",
        },
      ],
      quotes: [],
      campaignMembers: [],
      products: [
        { id: "p1", name: "CRM", active: true },
        { id: "p2", name: "AI Transformation", active: true },
      ],
      now,
    });

    expect(signals).toContainEqual(
      expect.objectContaining({
        signal_type: "cross_sell_opportunity",
        suggested_action: "Review AI Transformation as a cross-sell opportunity.",
      }),
    );
  });
});
