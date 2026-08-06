import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listAccountsPageMock,
  listWorkspaceViewsMock,
  listWorkspaceFavoritesMock,
  queryMock,
  requireCapabilityMock,
  createServerFnChain,
} = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    listAccountsPageMock: vi.fn(),
    listWorkspaceViewsMock: vi.fn(),
    listWorkspaceFavoritesMock: vi.fn(),
    queryMock: vi.fn(),
    requireCapabilityMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@/server/repositories/accounts", () => ({
  listAccountsPage: listAccountsPageMock,
}));
vi.mock("@/server/repositories/workspace-preferences", () => ({
  listWorkspaceViews: listWorkspaceViewsMock,
  listWorkspaceFavorites: listWorkspaceFavoritesMock,
}));
vi.mock("@/server/db/neon.server", () => ({ query: queryMock }));
vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: requireCapabilityMock,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("accounts index read model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts page and preference reads concurrently, then counts only current-page account IDs", async () => {
    const page = deferred<{
      items: Array<{ id: string; name: string }>;
      total: number;
      page: number;
      limit: number;
    }>();
    const views = deferred<Array<{ id: string }>>();
    const favorites = deferred<Array<{ id: string }>>();
    const clientCounts = deferred<Array<{ account_id: string; count: string }>>();
    const signalCounts = deferred<Array<{ account_id: string; count: string }>>();
    listAccountsPageMock.mockReturnValue(page.promise);
    listWorkspaceViewsMock.mockReturnValue(views.promise);
    listWorkspaceFavoritesMock.mockReturnValue(favorites.promise);
    queryMock.mockReturnValueOnce(clientCounts.promise).mockReturnValueOnce(signalCounts.promise);
    const { getAccountsIndexReadModel } = await import("../accounts-index");

    const resultPromise = getAccountsIndexReadModel("profile-1", {
      page: 2,
      limit: 25,
      lifecycle_stage: "active_client",
    });

    expect(listAccountsPageMock).toHaveBeenCalledWith({
      page: 2,
      limit: 25,
      lifecycle_stage: "active_client",
    });
    expect(listWorkspaceViewsMock).toHaveBeenCalledWith("profile-1", "account");
    expect(listWorkspaceFavoritesMock).toHaveBeenCalledWith("profile-1");
    expect(queryMock).not.toHaveBeenCalled();

    page.resolve({
      items: [
        { id: "account-1", name: "Acme" },
        { id: "account-2", name: "Bravo" },
      ],
      total: 52,
      page: 2,
      limit: 25,
    });
    views.resolve([{ id: "view-1" }]);
    favorites.resolve([{ id: "favorite-1" }]);
    await vi.waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));

    const countCalls = queryMock.mock.calls as Array<[string, unknown[]]>;
    expect(countCalls[0][0]).toMatch(/from clients/i);
    expect(countCalls[1][0]).toMatch(/from relationship_signals/i);
    expect(countCalls[1][0]).toMatch(/dismissed_at is null/i);
    expect(countCalls[0][1]).toEqual([["account-1", "account-2"]]);
    expect(countCalls[1][1]).toEqual([["account-1", "account-2"]]);

    clientCounts.resolve([
      { account_id: "account-1", count: "2" },
      { account_id: "account-2", count: "1" },
    ]);
    signalCounts.resolve([{ account_id: "account-2", count: "3" }]);

    await expect(resultPromise).resolves.toEqual({
      accounts: [
        { id: "account-1", name: "Acme" },
        { id: "account-2", name: "Bravo" },
      ],
      accountCounts: {
        "account-1": { linkedClientCount: 2, openSignalCount: 0 },
        "account-2": { linkedClientCount: 1, openSignalCount: 3 },
      },
      pagination: { total: 52, page: 2, limit: 25 },
      preferences: { views: [{ id: "view-1" }], favorites: [{ id: "favorite-1" }] },
    });
  });

  it("skips aggregate queries for an empty account page", async () => {
    listAccountsPageMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 });
    listWorkspaceViewsMock.mockResolvedValue([]);
    listWorkspaceFavoritesMock.mockResolvedValue([]);
    const { getAccountsIndexReadModel } = await import("../accounts-index");

    await expect(getAccountsIndexReadModel("profile-1", {})).resolves.toEqual({
      accounts: [],
      accountCounts: {},
      pagination: { total: 0, page: 1, limit: 25 },
      preferences: { views: [], favorites: [] },
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("keeps a high-activity account page within the 102,400 byte payload budget", async () => {
    const accounts = Array.from({ length: 100 }, (_, index) => ({
      id: `account-`,
      name: `High activity account `,
      industry: "Marketing",
      lifecycle_stage: "active_client",
      account_owner: "user-1",
      cs_owner: "user-2",
      relationship_health: 82,
      last_activity_at: "2026-07-20T00:00:00.000Z",
      next_action: "Schedule quarterly review",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-07-20T00:00:00.000Z",
    }));
    listAccountsPageMock.mockResolvedValue({ items: accounts, total: 100, page: 1, limit: 100 });
    listWorkspaceViewsMock.mockResolvedValue([]);
    listWorkspaceFavoritesMock.mockResolvedValue([]);
    queryMock.mockResolvedValue([]);
    const { getAccountsIndexReadModel } = await import("../accounts-index");

    const payload = await getAccountsIndexReadModel("profile-1", { page: 1, limit: 100 });
    const serializedBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;

    expect(serializedBytes).toBeLessThanOrEqual(102_400);
  });

  it("authorizes once before reading the account page and uses the authenticated profile", async () => {
    // Shaped like the real AppSession: `profile.id` is the actor id the read model scopes by,
    // and `user.id` is the upstream Neon Auth identity. Modelling only `user` here is what let
    // the two drift apart unnoticed.
    const authorization = deferred<{
      user: { id: string };
      profile: { id: string; role: string; status: string };
      session: Record<string, never>;
    }>();
    requireCapabilityMock.mockReturnValueOnce(authorization.promise);
    listAccountsPageMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 });
    listWorkspaceViewsMock.mockResolvedValue([]);
    listWorkspaceFavoritesMock.mockResolvedValue([]);
    const { getAccountsIndex } = await import("@/server-functions/accounts-index");

    const resultPromise = getAccountsIndex({ data: { page: 1, limit: 25 } });

    expect(requireCapabilityMock).toHaveBeenCalledTimes(1);
    expect(requireCapabilityMock).toHaveBeenCalledWith("accounts.view");
    expect(listAccountsPageMock).not.toHaveBeenCalled();

    authorization.resolve({
      user: { id: "profile-7" },
      profile: { id: "profile-7", role: "sales", status: "active" },
      session: {},
    });

    await expect(resultPromise).resolves.toMatchObject({ accounts: [], accountCounts: {} });
    expect(requireCapabilityMock).toHaveBeenCalledTimes(1);
    expect(listWorkspaceViewsMock).toHaveBeenCalledWith("profile-7", "account");
    expect(listWorkspaceFavoritesMock).toHaveBeenCalledWith("profile-7");
  });
});
