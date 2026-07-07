import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockBuildAccountTimeline } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockBuildAccountTimeline: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
}));

vi.mock("@/lib/relationship/timeline", () => ({
  buildAccountTimeline: mockBuildAccountTimeline,
}));

describe("account timeline repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads account timeline data from Neon sources", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "touchpoint-1", occurred_at: "2026-07-01T10:00:00.000Z" }])
      .mockResolvedValueOnce([{ id: "activity-1", created_at: "2026-07-01T09:00:00.000Z" }])
      .mockResolvedValueOnce([{ id: "task-1", created_at: "2026-07-01T08:00:00.000Z" }])
      .mockResolvedValueOnce([{ id: "quote-1", created_at: "2026-07-01T07:00:00.000Z" }])
      .mockResolvedValueOnce([{ id: "approval-1", created_at: "2026-07-01T06:00:00.000Z" }])
      .mockResolvedValueOnce([{ id: "run-1", created_at: "2026-07-01T05:00:00.000Z" }])
      .mockResolvedValueOnce([{ id: "member-1", created_at: "2026-07-01T04:00:00.000Z" }])
      .mockResolvedValueOnce([{ id: "lead-1", created_at: "2026-07-01T03:00:00.000Z" }])
      .mockResolvedValueOnce([{ id: "engagement-1", updated_at: "2026-07-01T02:00:00.000Z" }]);

    const { getAccountTimelineData } = await import("../account-timeline");

    await expect(getAccountTimelineData("account-1")).resolves.toEqual({
      touchpoints: [{ id: "touchpoint-1", occurred_at: "2026-07-01T10:00:00.000Z" }],
      activityLogs: [{ id: "activity-1", created_at: "2026-07-01T09:00:00.000Z" }],
      tasks: [{ id: "task-1", created_at: "2026-07-01T08:00:00.000Z" }],
      quotes: [{ id: "quote-1", created_at: "2026-07-01T07:00:00.000Z" }],
      approvals: [{ id: "approval-1", created_at: "2026-07-01T06:00:00.000Z" }],
      agentRuns: [{ id: "run-1", created_at: "2026-07-01T05:00:00.000Z" }],
      campaignMembers: [{ id: "member-1", created_at: "2026-07-01T04:00:00.000Z" }],
      leads: [{ id: "lead-1", created_at: "2026-07-01T03:00:00.000Z" }],
      engagements: [{ id: "engagement-1", updated_at: "2026-07-01T02:00:00.000Z" }],
    });

    expect(mockQuery).toHaveBeenCalledTimes(9);
    expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining("from touchpoints t"), [
      "account-1",
    ]);
    expect(mockQuery).toHaveBeenNthCalledWith(7, expect.stringContaining("from campaign_members"), [
      "account-1",
    ]);
    expect(mockQuery).toHaveBeenNthCalledWith(8, expect.stringContaining("from leads"), [
      "account-1",
    ]);
    expect(mockQuery).toHaveBeenNthCalledWith(9, expect.stringContaining("from engagements e"), [
      "account-1",
    ]);
  });

  it("builds the account timeline with an optional kind filter", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "touchpoint-1" }])
      .mockResolvedValueOnce([{ id: "activity-1" }])
      .mockResolvedValueOnce([{ id: "task-1" }])
      .mockResolvedValueOnce([{ id: "quote-1" }])
      .mockResolvedValueOnce([{ id: "approval-1" }])
      .mockResolvedValueOnce([{ id: "run-1" }])
      .mockResolvedValueOnce([{ id: "member-1" }])
      .mockResolvedValueOnce([{ id: "lead-1" }])
      .mockResolvedValueOnce([{ id: "engagement-1" }]);
    mockBuildAccountTimeline.mockReturnValue([{ id: "entry-1" }]);

    const { getAccountTimeline } = await import("../account-timeline");

    await expect(
      getAccountTimeline({ accountId: "account-1", kinds: ["activity", "task"] }),
    ).resolves.toEqual([{ id: "entry-1" }]);

    expect(mockBuildAccountTimeline).toHaveBeenCalledWith({
      touchpoints: [{ id: "touchpoint-1" }],
      activityLogs: [{ id: "activity-1" }],
      tasks: [{ id: "task-1" }],
      quotes: [{ id: "quote-1" }],
      approvals: [{ id: "approval-1" }],
      agentRuns: [{ id: "run-1" }],
      campaignMembers: [{ id: "member-1" }],
      leads: [{ id: "lead-1" }],
      engagements: [{ id: "engagement-1" }],
      kinds: ["activity", "task"],
    });
  });
});
