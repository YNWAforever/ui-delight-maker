import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

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

  it("escapes LIKE metacharacters in the account name search", async () => {
    // Unescaped, `%` matches every row and `_` matches any one character, so a typed `%` would
    // turn a filtered list into a tenant-wide one.
    mockQuery.mockResolvedValue([]);
    const { listAccounts } = await import("../accounts");

    await listAccounts({ query: " 100%_x " });

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("name ilike"), ["%100\\%\\_x%"]);
  });

  it("escapes LIKE metacharacters in the paginated account search and its count", async () => {
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue({ total: 1 });
    const { listAccountsPage } = await import("../accounts");

    await listAccountsPage({ query: "50%", page: 2, limit: 25 });

    // Both statements bind the same escaped contains-pattern, so the rows and the tile agree.
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining("count(*)"), ["%50\\%%"]);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("name ilike"), [
      "%50\\%%",
      25,
      25,
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
});
