import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock, queryMock, createTaskMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  queryMock: vi.fn(),
  createTaskMock: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  transaction: transactionMock,
  query: queryMock,
}));

vi.mock("@/server/repositories/tasks", () => ({
  createTask: createTaskMock,
}));

describe("campaign follow-up repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (work: (db: object) => Promise<unknown>) => work({}));
    createTaskMock.mockResolvedValue({ id: "task-1" });
  });

  it("creates idempotent follow-up tasks for not-started campaign members", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: "member-1",
          campaign_id: "campaign-1",
          account_id: "account-1",
          contact_id: "contact-1",
          raw_contact_name: "Ada Wong",
          raw_email: "ada@example.com",
          raw_company_name: "Fimmick",
          interests: ["CRM"],
          notes: "Asked about renewal workflow.",
          follow_up_owner: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const { createCampaignFollowUpTasks } = await import("../campaign-follow-ups");

    const result = await createCampaignFollowUpTasks({
      campaignId: "campaign-1",
      actorId: "owner-1",
    });

    expect(createTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Follow up event attendee: Ada Wong",
        assigned_to: "owner-1",
        account_id: "account-1",
        contact_id: "contact-1",
        priority: "medium",
      }),
      expect.anything(),
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("set follow_up_status = 'task_created'"),
      ["member-1", "owner-1"],
      expect.anything(),
    );
    expect(result).toEqual({ createdTasks: 1, skippedMembers: 0 });
  });

  it("does not create duplicate tasks when members already left not-started state", async () => {
    queryMock.mockResolvedValueOnce([]);

    const { createCampaignFollowUpTasks } = await import("../campaign-follow-ups");

    const result = await createCampaignFollowUpTasks({
      campaignId: "campaign-1",
      actorId: "owner-1",
    });

    expect(createTaskMock).not.toHaveBeenCalled();
    expect(result).toEqual({ createdTasks: 0, skippedMembers: 0 });
  });
});
