import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
  transaction: vi.fn(),
}));

type PageResult = {
  items: unknown[];
  total: number;
  page: number;
  limit: number;
};

const loadAccountsPage = async () => (await import("../accounts")).listAccountsPage;
const loadClientsPage = async () => (await import("../clients")).listClientsPage;
const accountFilters = {
  owner: "owner-1",
  cs_owner: "cs-1",
  lifecycle_stage: "prospect",
  query: "Acme",
};
const accountFilterValues = ["owner-1", "cs-1", "prospect", "%Acme%"];
const accountSqlMarkers = ["account_owner", "cs_owner", "lifecycle_stage", "name ilike"];
const clientFilters = {
  tier: "enterprise",
  account_id: "account-1",
  health_min: 75,
};
const clientFilterValues = ["enterprise", "account-1", 75];
const clientSqlMarkers = ["c.tier", "c.account_id", "rollup_health_score"];

describe("paginated account repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([{ id: "row-1" }]);
    mockQueryOne.mockResolvedValue({ total: "7" });
  });

  it("defaults to page 1 with 50 rows and returns the total", async () => {
    const listPage = await loadAccountsPage();

    await expect(listPage()).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "row-1" })],
      total: 7,
      page: 1,
      limit: 50,
    });

    const [listSql, listValues] = mockQuery.mock.calls[0];
    expect(listSql).toMatch(/order by[\s\S]+limit \$1 offset \$2/i);
    expect(listValues).toEqual([50, 0]);
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining("count(*)"), []);
  });

  it("pushes filters into list/count SQL and clamps the limit to 100", async () => {
    const listPage = await loadAccountsPage();

    const result = await listPage({ ...accountFilters, page: 2, limit: 500 });

    expect(result).toMatchObject({ total: 7, page: 2, limit: 100 });
    const [listSql, listValues] = mockQuery.mock.calls[0];
    const [countSql, countValues] = mockQueryOne.mock.calls[0];
    for (const marker of accountSqlMarkers) {
      expect(listSql).toContain(marker);
      expect(countSql).toContain(marker);
    }
    expect(listValues).toEqual([...accountFilterValues, 100, 100]);
    expect(countValues).toEqual(accountFilterValues);
  });

  it("returns an empty page without changing the total", async () => {
    mockQuery.mockResolvedValueOnce([]);
    mockQueryOne.mockResolvedValueOnce({ total: 12 });
    const listPage = await loadAccountsPage();

    await expect(listPage({ page: 4, limit: 10 })).resolves.toEqual({
      items: [],
      total: 12,
      page: 4,
      limit: 10,
    });
  });
});

describe("paginated client repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([{ id: "client-1", rollup_arr: "1200", rollup_health_score: 80 }]);
    mockQueryOne.mockResolvedValue({ total: "7" });
  });

  it("defaults to page 1 with 50 rows and returns the total", async () => {
    const listPage = await loadClientsPage();

    await expect(listPage()).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "client-1" })],
      total: 7,
      page: 1,
      limit: 50,
    });

    const [listSql, listValues] = mockQuery.mock.calls[0];
    expect(listSql).toMatch(/order by c\.company_name[\s\S]+limit \$1 offset \$2/i);
    expect(listValues).toEqual([50, 0]);
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining("count(*)"), []);
  });

  it("pushes filters into list/count SQL and clamps the limit to 100", async () => {
    const listPage = await loadClientsPage();

    const result = await listPage({ ...clientFilters, page: 2, limit: 500 });

    expect(result).toMatchObject({ total: 7, page: 2, limit: 100 });
    const [listSql, listValues] = mockQuery.mock.calls[0];
    const [countSql, countValues] = mockQueryOne.mock.calls[0];
    for (const marker of clientSqlMarkers) {
      expect(listSql).toContain(marker);
      expect(countSql).toContain(marker);
    }
    expect(listValues).toEqual([...clientFilterValues, 100, 100]);
    expect(countValues).toEqual(clientFilterValues);
  });

  it("returns an empty page without changing the total", async () => {
    mockQuery.mockResolvedValueOnce([]);
    mockQueryOne.mockResolvedValueOnce({ total: 12 });
    const listPage = await loadClientsPage();

    await expect(listPage({ page: 4, limit: 10 })).resolves.toEqual({
      items: [],
      total: 12,
      page: 4,
      limit: 10,
    });
  });
});