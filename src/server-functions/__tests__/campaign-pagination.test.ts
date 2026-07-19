import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chain = {
    validator() {
      return chain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };
  return {
    chain,
    requireCapability: vi.fn(),
    requireSession: vi.fn(),
    listCampaignsPage: vi.fn(),
  };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => mocks.chain }));
vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: mocks.requireCapability,
}));
vi.mock("@/lib/auth/neon-auth.server", () => ({ requireNeonAuthSession: mocks.requireSession }));
vi.mock("@/server/repositories/campaigns", () => ({
  createCampaign: vi.fn(),
  createCampaignMember: vi.fn(),
  getCampaignWithMembers: vi.fn(),
  listCampaigns: vi.fn(),
  listCampaignsPage: mocks.listCampaignsPage,
  updateCampaign: vi.fn(),
}));
vi.mock("@/server/repositories/campaign-follow-ups", () => ({
  createCampaignFollowUpTasks: vi.fn(),
}));

const loadPage = async () => (await import("../campaigns")).getCampaignsPage;
const data = { status: "active", type: "event", owner: "user-1", page: 2, limit: 25 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.listCampaignsPage.mockResolvedValue({ items: [], total: 0, page: 2, limit: 25 });
});

describe("paginated campaign server function", () => {
  it("authorizes, validates the session, and forwards pagination inputs", async () => {
    const getPage = await loadPage();

    await getPage({ data });

    expect(mocks.requireCapability).toHaveBeenCalledWith("campaigns.view");
    expect(mocks.requireSession).toHaveBeenCalledOnce();
    expect(mocks.listCampaignsPage).toHaveBeenCalledWith(data);
    expect(mocks.requireCapability.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listCampaignsPage.mock.invocationCallOrder[0],
    );
    expect(mocks.requireSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listCampaignsPage.mock.invocationCallOrder[0],
    );
  });

  it("does not query when session validation fails", async () => {
    mocks.requireSession.mockRejectedValueOnce(new Error("Unauthorized"));
    const getPage = await loadPage();

    await expect(getPage({ data })).rejects.toThrow("Unauthorized");
    expect(mocks.listCampaignsPage).not.toHaveBeenCalled();
  });
});
