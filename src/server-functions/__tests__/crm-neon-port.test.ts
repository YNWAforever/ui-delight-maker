import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireCapabilityMock,
  createServerFnChain,
  mockRequireNeonAuthSession,
  mockListAccounts,
  mockGetAccount,
  mockCreateAccount,
  mockUpdateAccount,
  mockListAccountContacts,
  mockCreateAccountContact,
  mockUpdateAccountContact,
  mockListCampaigns,
  mockGetCampaignWithMembers,
  mockCreateCampaign,
  mockUpdateCampaign,
  mockCreateCampaignMember,
  mockGetAccountTimeline,
} = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: unknown[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    requireCapabilityMock: vi.fn(),
    createServerFnChain,
    mockRequireNeonAuthSession: vi.fn(),
    mockListAccounts: vi.fn(),
    mockGetAccount: vi.fn(),
    mockCreateAccount: vi.fn(),
    mockUpdateAccount: vi.fn(),
    mockListAccountContacts: vi.fn(),
    mockCreateAccountContact: vi.fn(),
    mockUpdateAccountContact: vi.fn(),
    mockListCampaigns: vi.fn(),
    mockGetCampaignWithMembers: vi.fn(),
    mockCreateCampaign: vi.fn(),
    mockUpdateCampaign: vi.fn(),
    mockCreateCampaignMember: vi.fn(),
    mockGetAccountTimeline: vi.fn(),
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: requireCapabilityMock,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: mockRequireNeonAuthSession,
}));

vi.mock("@/server/repositories/accounts", () => ({
  listAccounts: mockListAccounts,
  getAccount: mockGetAccount,
  createAccount: mockCreateAccount,
  updateAccount: mockUpdateAccount,
}));

vi.mock("@/server/repositories/account-contacts", () => ({
  listAccountContacts: mockListAccountContacts,
  createAccountContact: mockCreateAccountContact,
  updateAccountContact: mockUpdateAccountContact,
}));

vi.mock("@/server/repositories/campaigns", () => ({
  listCampaigns: mockListCampaigns,
  getCampaignWithMembers: mockGetCampaignWithMembers,
  createCampaign: mockCreateCampaign,
  updateCampaign: mockUpdateCampaign,
  createCampaignMember: mockCreateCampaignMember,
}));

vi.mock("@/server/repositories/account-timeline", () => ({
  getAccountTimeline: mockGetAccountTimeline,
}));

describe("ported CRM server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCapabilityMock.mockResolvedValue({ user: { id: "user-1" } });

    mockRequireNeonAuthSession.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("requires auth before listing accounts", async () => {
    mockListAccounts.mockResolvedValue([{ id: "account-1" }]);
    const { getAccounts } = await import("../accounts");

    await expect(getAccounts({ data: { owner: "owner-1" } })).resolves.toEqual([
      { id: "account-1" },
    ]);
    expect(mockRequireNeonAuthSession).toHaveBeenCalledTimes(1);
    expect(mockListAccounts).toHaveBeenCalledWith({ owner: "owner-1" });
  });

  it("routes account contact operations through Neon repositories", async () => {
    mockListAccountContacts.mockResolvedValue([{ id: "contact-1" }]);
    mockCreateAccountContact.mockResolvedValue({ id: "contact-1" });
    mockUpdateAccountContact.mockResolvedValue({ id: "contact-1", active: false });
    const { getAccountContacts, createAccountContact, updateAccountContact } =
      await import("../contacts");

    await expect(getAccountContacts({ data: { accountId: "account-1" } })).resolves.toEqual([
      { id: "contact-1" },
    ]);
    await expect(
      createAccountContact({ data: { account_id: "account-1", name: "Ada" } }),
    ).resolves.toEqual({ id: "contact-1" });
    await expect(
      updateAccountContact({ data: { id: "contact-1", updates: { active: false } } }),
    ).resolves.toEqual({ id: "contact-1", active: false });

    expect(mockRequireNeonAuthSession).toHaveBeenCalledTimes(3);
    expect(mockListAccountContacts).toHaveBeenCalledWith("account-1");
    expect(mockCreateAccountContact).toHaveBeenCalledWith({ account_id: "account-1", name: "Ada" });
    expect(mockUpdateAccountContact).toHaveBeenCalledWith("contact-1", { active: false });
  });

  it("routes campaigns and members through Neon repositories", async () => {
    mockGetCampaignWithMembers.mockResolvedValue({ campaign: { id: "campaign-1" }, members: [] });
    mockCreateCampaignMember.mockResolvedValue({ id: "member-1" });
    const { getCampaign, addCampaignMember } = await import("../campaigns");

    await expect(getCampaign({ data: { id: "campaign-1" } })).resolves.toEqual({
      campaign: { id: "campaign-1" },
      members: [],
    });
    await expect(addCampaignMember({ data: { campaign_id: "campaign-1" } })).resolves.toEqual({
      id: "member-1",
    });

    expect(mockRequireNeonAuthSession).toHaveBeenCalledTimes(2);
    expect(mockGetCampaignWithMembers).toHaveBeenCalledWith("campaign-1");
    expect(mockCreateCampaignMember).toHaveBeenCalledWith({ campaign_id: "campaign-1" });
  });

  it("uses the authenticated profile as owner when creating campaigns", async () => {
    mockRequireNeonAuthSession.mockResolvedValueOnce({ user: { id: "signed-in-user" } });
    mockCreateCampaign.mockResolvedValue({ id: "campaign-1", owner: "signed-in-user" });
    const { createCampaign } = await import("../campaigns");

    await expect(
      createCampaign({
        data: {
          name: "Codex smoke campaign",
          owner: "00000000-0000-0000-0000-000000000001",
        },
      }),
    ).resolves.toEqual({ id: "campaign-1", owner: "signed-in-user" });

    expect(mockCreateCampaign).toHaveBeenCalledWith({
      name: "Codex smoke campaign",
      owner: "signed-in-user",
    });
  });

  it("requires auth before loading the account timeline", async () => {
    mockGetAccountTimeline.mockResolvedValue([{ id: "entry-1" }]);
    const { getAccountTimeline } = await import("../activity-logs");

    await expect(
      getAccountTimeline({ data: { accountId: "account-1", kinds: ["activity"] } }),
    ).resolves.toEqual([{ id: "entry-1" }]);

    expect(mockRequireNeonAuthSession).toHaveBeenCalledTimes(1);
    expect(mockGetAccountTimeline).toHaveBeenCalledWith({
      accountId: "account-1",
      kinds: ["activity"],
    });
  });
});
