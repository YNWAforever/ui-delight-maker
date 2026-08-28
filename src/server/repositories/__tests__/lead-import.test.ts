import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTransaction, mockDbQuery } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockDbQuery: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  transaction: mockTransaction,
}));

const { commitLeadImport } = await import("../lead-import");

/** Every SQL string the commit issued, whitespace-collapsed for matching. */
function sqlIssued(): string[] {
  return mockDbQuery.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, " ").trim());
}

describe("commitLeadImport", () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockTransaction.mockReset();
    mockTransaction.mockImplementation(async (work) => work({ query: mockDbQuery }));
    mockDbQuery.mockResolvedValue({ rows: [] });
  });

  it("inserts an unmatched row and stamps it as a CSV lead", async () => {
    const result = await commitLeadImport(
      [{ company_name: "Acme Ltd", contact_email: "ops@acme.example", contact_name: "Dana" }],
      "profile-1",
    );

    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
    const insert = sqlIssued().find((sql) => sql.startsWith("insert into leads"));
    expect(insert).toBeDefined();
    expect(insert).toContain("source");
  });

  it("records the import in the activity log", async () => {
    await commitLeadImport(
      [{ company_name: "Acme Ltd", contact_email: "ops@acme.example" }],
      "profile-1",
    );

    expect(sqlIssued().some((sql) => sql.includes("insert into activity_logs"))).toBe(true);
  });
});
