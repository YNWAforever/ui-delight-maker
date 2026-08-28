import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: vi.fn(),
  transaction: vi.fn(),
}));

const { summariseLeadTimeline } = await import("../lead-timeline");

describe("summariseLeadTimeline", () => {
  beforeEach(() => mockQuery.mockReset());

  it("rolls activity up per action, with a total and the newest timestamp", async () => {
    mockQuery.mockResolvedValue([
      { action: "email_sent", count: "2", last_at: "2026-08-22T11:02:00.000Z" },
      { action: "note_added", count: "4", last_at: "2026-08-20T09:14:00.000Z" },
    ]);

    const summary = await summariseLeadTimeline("lead-1");

    expect(summary.total).toBe(6);
    expect(summary.lastActivityAt).toBe("2026-08-22T11:02:00.000Z");
    expect(summary.byAction).toEqual([
      { action: "email_sent", count: 2, lastAt: "2026-08-22T11:02:00.000Z" },
      { action: "note_added", count: 4, lastAt: "2026-08-20T09:14:00.000Z" },
    ]);
  });

  it("returns an empty summary rather than nothing for a lead with no activity", async () => {
    // Empty and broken are different claims and must be distinguishable by the caller.
    mockQuery.mockResolvedValue([]);

    const summary = await summariseLeadTimeline("lead-1");

    expect(summary).toEqual({ total: 0, lastActivityAt: null, byAction: [] });
  });

  it("issues exactly one query", async () => {
    // A later refactor that fanned out per action would be an N+1 on a dashboard.
    mockQuery.mockResolvedValue([]);
    await summariseLeadTimeline("lead-1");
    expect(mockQuery).toHaveBeenCalledOnce();
  });

  it("scopes the query to this lead", async () => {
    mockQuery.mockResolvedValue([]);
    await summariseLeadTimeline("lead-1");

    const [sql, values] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("object_type = 'lead'");
    expect(values).toEqual(["lead-1"]);
  });
});
