import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
const jobSheetAuthorization = {
  actor: { profileId: "fixture-accounting", role: "accounting", status: "active", directReportIds: [] },
  overrides: [],
  now: new Date("2026-09-27T00:00:00Z"),
  session: { profile: { id: "fixture-accounting" } },
} as unknown as RequestAuthorization;


const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
  transaction: vi.fn(),
}));

const loadPage = async () => (await import("../job-sheets")).listJobSheetsPage;
const filters = { status: "accounting_review", client_id: "client-1", account_id: "account-1" };
const values = ["accounting_review", "client-1", "account-1"];

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue([{ id: "job-1" }]);
  mockQueryOne.mockResolvedValue({ total: "7" });
});

describe("paginated job-sheet repository", () => {
  it("defaults to page 1 with 50 rows and returns the total", async () => {
    const listPage = await loadPage();
    await expect(listPage({}, jobSheetAuthorization)).resolves.toMatchObject({
      items: [{ id: "job-1" }],
      total: 7,
      page: 1,
      limit: 50,
    });
    expect(mockQuery.mock.calls[0][1].slice(-2)).toEqual([50, 0]);
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining("count(*)"), expect.any(Array));
    expect(mockQueryOne.mock.calls[0][0]).toContain("jsonb_array_elements");
  });

  it("pushes filters into list/count SQL and clamps the limit", async () => {
    const listPage = await loadPage();
    await expect(listPage({ ...filters, page: 2, limit: 500 }, jobSheetAuthorization)).resolves.toMatchObject({
      total: 7,
      page: 2,
      limit: 100,
    });
    const [listSql, listValues] = mockQuery.mock.calls[0];
    const [countSql, countValues] = mockQueryOne.mock.calls[0];
    for (const marker of ["status", "client_id", "account_id"]) {
      expect(listSql).toContain(marker);
      expect(countSql).toContain(marker);
    }
    expect(listValues.slice(0, 3)).toEqual(values);
    expect(listValues.slice(-2)).toEqual([100, 100]);
    expect(countValues.slice(0, 3)).toEqual(values);
    expect(countValues).toHaveLength(8);
  });
});
