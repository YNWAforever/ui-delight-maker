import { describe, expect, it } from "vitest";

import { buildAccountTimeline } from "../timeline";

describe("buildAccountTimeline", () => {
  it("merges timeline sources newest first", () => {
    const entries = buildAccountTimeline({
      touchpoints: [
        {
          id: "tp1",
          type: "meeting",
          sentiment: "positive",
          notes: "Met champion",
          occurred_at: "2026-07-01T09:00:00.000Z",
        },
      ],
      activityLogs: [
        {
          id: "log1",
          actor_id: null,
          actor_name: "Renewal Risk Agent",
          actor_type: "agent",
          action: "scored renewal risk",
          object_type: "engagement",
          object_id: "e1",
          diff_data: null,
          created_at: "2026-07-02T10:00:00.000Z",
        },
      ],
      tasks: [],
      quotes: [],
      approvals: [],
      agentRuns: [],
      campaignMembers: [],
    });

    expect(entries.map((entry) => entry.id)).toEqual(["activity:log1", "touchpoint:tp1"]);
    expect(entries[0]).toMatchObject({
      kind: "activity",
      title: "Renewal Risk Agent scored renewal risk",
    });
  });

  it("filters by kind when requested", () => {
    const entries = buildAccountTimeline({
      touchpoints: [
        {
          id: "tp1",
          type: "call",
          sentiment: "neutral",
          notes: null,
          occurred_at: "2026-07-01T09:00:00.000Z",
        },
      ],
      activityLogs: [],
      tasks: [
        {
          id: "task1",
          title: "Follow up attendee",
          status: "open",
          due_date: "2026-07-04",
          created_at: "2026-07-03T09:00:00.000Z",
        },
      ],
      quotes: [],
      approvals: [],
      agentRuns: [],
      campaignMembers: [],
      kinds: ["task"],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("task");
  });

  it("formats quote detail deterministically", () => {
    const entries = buildAccountTimeline({
      touchpoints: [],
      activityLogs: [],
      tasks: [],
      quotes: [
        {
          id: "q1",
          number: "Q-001",
          status: "sent",
          total_value: 1234567.89,
          currency: "HKD",
          created_at: "2026-07-03T09:00:00.000Z",
        },
      ],
      approvals: [],
      agentRuns: [],
      campaignMembers: [],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "quote",
      title: "Quote Q-001",
      detail: "HKD 1,234,567.89",
    });
  });

  it("includes lead and engagement entries", () => {
    const entries = buildAccountTimeline({
      touchpoints: [],
      activityLogs: [],
      tasks: [],
      quotes: [],
      approvals: [],
      agentRuns: [],
      campaignMembers: [],
      leads: [
        {
          id: "lead1",
          company_name: "Fimmick",
          contact_name: "Ada Wong",
          status: "qualified",
          source: "event",
          created_at: "2026-07-04T09:00:00.000Z",
        },
      ],
      engagements: [
        {
          id: "engagement1",
          product_id: "product-1",
          status: "active",
          renewal_date: "2026-09-01",
          renewal_risk: "medium",
          next_action: "Schedule QBR",
          updated_at: "2026-07-05T09:00:00.000Z",
          created_at: "2026-07-03T09:00:00.000Z",
        },
      ],
    });

    expect(entries.map((entry) => entry.id)).toEqual(["engagement:engagement1", "lead:lead1"]);
    expect(entries[0]).toMatchObject({
      kind: "engagement",
      title: "Engagement active",
      status: "medium",
    });
    expect(entries[1]).toMatchObject({
      kind: "lead",
      title: "Lead qualified: Ada Wong",
      status: "qualified",
    });
  });
});
