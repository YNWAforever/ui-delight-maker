import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockQuery,
  mockQueryOne,
  mockListAccountContacts,
  mockListClients,
  mockListLeads,
  mockListQuotes,
  mockListTasks,
  mockGetAccountTimeline,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
  mockListAccountContacts: vi.fn(),
  mockListClients: vi.fn(),
  mockListLeads: vi.fn(),
  mockListQuotes: vi.fn(),
  mockListTasks: vi.fn(),
  mockGetAccountTimeline: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

vi.mock("@/server/repositories/account-contacts", () => ({
  listAccountContacts: mockListAccountContacts,
}));

vi.mock("@/server/repositories/account-timeline", () => ({
  getAccountTimeline: mockGetAccountTimeline,
}));

vi.mock("@/server/repositories/clients", () => ({ listClients: mockListClients }));
vi.mock("@/server/repositories/leads", () => ({ listLeads: mockListLeads }));
vi.mock("@/server/repositories/quotes", () => ({ listQuotes: mockListQuotes }));
vi.mock("@/server/repositories/tasks", () => ({ listTasks: mockListTasks }));

describe("accounts repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists accounts with optional owners and name search", async () => {
    mockQuery.mockResolvedValue([]);
    const { listAccounts } = await import("../accounts");

    await listAccounts({
      owner: "owner-1",
      cs_owner: "cs-1",
      lifecycle_stage: "prospect",
      query: "Acme",
    });

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("from accounts"), [
      "owner-1",
      "cs-1",
      "prospect",
      "%Acme%",
    ]);
  });

  it("orders a page by the requested sort key and falls back for anything else", async () => {
    // Sorting used to be done in the route over the current page, so "Name A-Z" on a
    // multi-page tenant ordered at most one page and presented it as the whole workspace.
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue({ total: 0 });
    const { listAccountsPage } = await import("../accounts");

    await listAccountsPage({ sort: "name:asc", page: 1, limit: 25 });
    expect(mockQuery.mock.calls.at(-1)?.[0]).toContain("order by name asc, id desc");

    await listAccountsPage({ sort: "relationship_health:asc" });
    expect(mockQuery.mock.calls.at(-1)?.[0]).toContain("order by relationship_health asc, id desc");

    // Nothing a caller sends reaches the SQL text: an unknown key is not interpolated, it
    // is discarded for the default ordering.
    await listAccountsPage({ sort: "name asc; drop table accounts" });
    const injected = mockQuery.mock.calls.at(-1)?.[0] as string;
    expect(injected).not.toContain("drop table");
    expect(injected).toContain("order by coalesce(last_activity_at, created_at) desc, id desc");

    await listAccountsPage({});
    expect(mockQuery.mock.calls.at(-1)?.[0]).toContain(
      "order by coalesce(last_activity_at, created_at) desc, id desc",
    );
  });

  it("every offered ordering ends with a unique tie-break", async () => {
    // Without one, a limit/offset page boundary can repeat or skip a row between pages.
    const { ACCOUNT_ORDER_BY } = await import("../accounts");

    for (const clause of Object.values(ACCOUNT_ORDER_BY)) {
      expect(clause.endsWith("id desc")).toBe(true);
    }
  });

  it("creates accounts with prospect and empty tag defaults", async () => {
    mockQueryOne.mockResolvedValue({ id: "account-1" });
    const { createAccount } = await import("../accounts");

    await createAccount({ name: "Acme" });

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("insert into accounts"),
      ["Acme", null, null, null, null, null, null, null, null, null, null, null],
      undefined,
    );
  });

  it("updates only allowed account columns", async () => {
    mockQueryOne.mockResolvedValue({ id: "account-1", name: "Renamed" });
    const { updateAccount } = await import("../accounts");

    await updateAccount("account-1", { name: "Renamed", notes: "hello" });

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("update accounts"),
      ["Renamed", "hello", "account-1"],
      undefined,
    );
  });

  it("composes the full Account workspace from linked records", async () => {
    mockQueryOne.mockResolvedValue({
      id: "account-1",
      name: "Acme",
      lifecycle_stage: "active_client",
    });
    mockListAccountContacts.mockResolvedValue([{ id: "contact-1", is_primary: true }]);
    mockListClients.mockResolvedValue([{ id: "client-1" }]);
    mockListLeads.mockResolvedValue([{ id: "lead-1" }]);
    mockListQuotes.mockResolvedValue([{ id: "quote-1", status: "sent" }]);
    mockListTasks.mockResolvedValue([{ id: "task-1", status: "open" }]);
    mockGetAccountTimeline.mockResolvedValue([{ id: "timeline-1" }]);
    const { getAccountWorkspaceData } = await import("../accounts");

    const workspace = await getAccountWorkspaceData("account-1");

    expect(mockListAccountContacts).toHaveBeenCalledWith("account-1");
    expect(mockListClients).toHaveBeenCalledWith({ account_id: "account-1" });
    expect(mockListLeads).toHaveBeenCalledWith({ account_id: "account-1" });
    expect(mockListQuotes).toHaveBeenCalledWith({ account_id: "account-1" });
    expect(mockListTasks).toHaveBeenCalledWith({ account_id: "account-1" });
    expect(workspace.summary).toMatchObject({ id: "account-1", primaryContactId: "contact-1" });
    expect(workspace.timeline).toEqual([{ id: "timeline-1" }]);
  });
});
