import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

describe("campaigns repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists campaigns with mapped filters", async () => {
    mockQuery.mockResolvedValue([]);
    const { listCampaigns } = await import("../campaigns");

    await listCampaigns({ status: "active", type: "webinar", owner: "owner-1" });

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("select * from campaigns"), [
      "active",
      "webinar",
      "owner-1",
    ]);
  });

  it("loads a campaign and its members together", async () => {
    mockQueryOne.mockResolvedValue({ id: "campaign-1", name: "Spring Roadshow" });
    mockQuery.mockResolvedValue([{ id: "member-1" }]);
    const { getCampaignWithMembers } = await import("../campaigns");

    await expect(getCampaignWithMembers("campaign-1")).resolves.toEqual({
      campaign: { id: "campaign-1", name: "Spring Roadshow" },
      members: [{ id: "member-1" }],
    });
  });

  it("creates campaign members with attendee-status defaults", async () => {
    mockQueryOne.mockResolvedValue({ id: "member-1" });
    const { createCampaignMember } = await import("../campaigns");

    await createCampaignMember({ campaign_id: "campaign-1" });

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("insert into campaign_members"),
      ["campaign-1", null, null, null, null, null, null, null, null, null, null, null, null],
      undefined,
    );
  });
});
