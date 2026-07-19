import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    createServerFnChain,
    requireCapability: vi.fn(),
    requireSession: vi.fn(),
    listAccountsPage: vi.fn(),
    listClientsPage: vi.fn(),
    listLeadsPage: vi.fn(),
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => mocks.createServerFnChain,
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: mocks.requireCapability,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: mocks.requireSession,
}));

vi.mock("@/server/repositories/accounts", () => ({
  createAccount: vi.fn(),
  getAccount: vi.fn(),
  getAccountWorkspaceData: vi.fn(),
  listAccounts: vi.fn(),
  listAccountsPage: mocks.listAccountsPage,
  updateAccount: vi.fn(),
}));

vi.mock("@/server/repositories/clients", () => ({
  createClient: vi.fn(),
  getClient: vi.fn(),
  listClients: vi.fn(),
  listClientsPage: mocks.listClientsPage,
  updateClient: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  convertWonLeadToEngagement: vi.fn(),
  createLead: vi.fn(),
  getLeadWithActivity: vi.fn(),
  listLeads: vi.fn(),
  listLeadsPage: mocks.listLeadsPage,
  moveLeadStage: vi.fn(),
  updateLead: vi.fn(),
}));

const accountPageData = { owner: "owner-1", page: 2, limit: 25 };
const loadAccountsPage = async () => (await import("../accounts")).getAccountsPage;
const clientPageData = { tier: "enterprise", page: 2, limit: 25 };
const loadClientsPage = async () => (await import("../clients")).getClientsPage;
const leadPageData = { status: "qualified", page: 2, limit: 25 };
const loadLeadsPage = async () => (await import("../leads")).getLeadsPage;

describe("paginated account server function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCapability.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.listAccountsPage.mockResolvedValue({ items: [], total: 0, page: 2, limit: 25 });
  });

  it("authorizes and forwards scoped pagination inputs", async () => {
    const getPage = await loadAccountsPage();

    await getPage({ data: accountPageData });

    expect(mocks.requireCapability).toHaveBeenCalledWith("accounts.view");
    expect(mocks.requireSession).toHaveBeenCalledOnce();
    expect(mocks.listAccountsPage).toHaveBeenCalledWith(accountPageData);
    expect(mocks.requireCapability.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listAccountsPage.mock.invocationCallOrder[0],
    );
    expect(mocks.requireSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listAccountsPage.mock.invocationCallOrder[0],
    );
  });

  it("does not read pages when the authenticated session fails", async () => {
    mocks.requireSession.mockRejectedValueOnce(new Error("Unauthorized"));
    const getPage = await loadAccountsPage();

    await expect(getPage({ data: accountPageData })).rejects.toThrow("Unauthorized");
    expect(mocks.listAccountsPage).not.toHaveBeenCalled();
  });
});

describe("paginated client server function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCapability.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.listClientsPage.mockResolvedValue({ items: [], total: 0, page: 2, limit: 25 });
  });

  it("authorizes and forwards scoped pagination inputs", async () => {
    const getPage = await loadClientsPage();

    await getPage({ data: clientPageData });

    expect(mocks.requireCapability).toHaveBeenCalledWith("accounts.view");
    expect(mocks.requireSession).toHaveBeenCalledOnce();
    expect(mocks.listClientsPage).toHaveBeenCalledWith(clientPageData);
    expect(mocks.requireCapability.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listClientsPage.mock.invocationCallOrder[0],
    );
    expect(mocks.requireSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listClientsPage.mock.invocationCallOrder[0],
    );
  });

  it("does not read pages when the authenticated session fails", async () => {
    mocks.requireSession.mockRejectedValueOnce(new Error("Unauthorized"));
    const getPage = await loadClientsPage();

    await expect(getPage({ data: clientPageData })).rejects.toThrow("Unauthorized");
    expect(mocks.listClientsPage).not.toHaveBeenCalled();
  });
});
describe("paginated lead server function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCapability.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.listLeadsPage.mockResolvedValue({ items: [], total: 0, page: 2, limit: 25 });
  });

  it("authorizes and forwards scoped pagination inputs", async () => {
    const getPage = await loadLeadsPage();

    await getPage({ data: leadPageData });

    expect(mocks.requireCapability).toHaveBeenCalledWith("leads.view");
    expect(mocks.requireSession).toHaveBeenCalledOnce();
    expect(mocks.listLeadsPage).toHaveBeenCalledWith(leadPageData);
    expect(mocks.requireCapability.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listLeadsPage.mock.invocationCallOrder[0],
    );
    expect(mocks.requireSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listLeadsPage.mock.invocationCallOrder[0],
    );
  });

  it("does not read pages when the authenticated session fails", async () => {
    mocks.requireSession.mockRejectedValueOnce(new Error("Unauthorized"));
    const getPage = await loadLeadsPage();

    await expect(getPage({ data: leadPageData })).rejects.toThrow("Unauthorized");
    expect(mocks.listLeadsPage).not.toHaveBeenCalled();
  });
});
