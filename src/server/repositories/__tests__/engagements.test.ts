import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
}));

describe("engagements repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads every engagement for an account through the client association", async () => {
    mockQuery.mockResolvedValue([
      { id: "engagement-1", client_id: "client-1" },
      { id: "engagement-2", client_id: "client-2" },
    ]);
    const { listEngagementsByAccount } = await import("../engagements");

    await expect(listEngagementsByAccount("account-1")).resolves.toEqual([
      { id: "engagement-1", client_id: "client-1" },
      { id: "engagement-2", client_id: "client-2" },
    ]);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("join clients c on c.id = e.client_id"),
      ["account-1"],
    );
  });

  it("reads the active engagement count without loading engagement records", async () => {
    mockQuery.mockResolvedValue([{ active_count: 3 }]);
    const { getAccountEngagementSummary } = await import("../engagements");

    await expect(getAccountEngagementSummary("account-1")).resolves.toEqual({ activeCount: 3 });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("count(*)"),
      ["account-1"],
    );
  });
});
