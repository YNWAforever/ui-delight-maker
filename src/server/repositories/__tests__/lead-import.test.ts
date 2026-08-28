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

  it("fills a blank on a match and never mentions sales state in the update", async () => {
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("from leads")) {
        return {
          rows: [{ id: "lead-1", contact_name: "Dana", contact_phone: null, enquiry_text: null }],
        };
      }
      return { rows: [] };
    });

    const result = await commitLeadImport(
      [
        {
          company_name: "Acme Ltd",
          contact_email: "ops@acme.example",
          contact_name: "Ignored",
          contact_phone: "+852 1234 5678",
        },
      ],
      "profile-1",
    );

    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });

    const update = sqlIssued().find((sql) => sql.startsWith("update leads"));
    expect(update).toBeDefined();
    // The blank is filled...
    expect(update).toContain("contact_phone =");
    // ...the populated field is not touched at all...
    expect(update).not.toContain("contact_name =");
    // ...and sales state is absent from the statement, not merely passed unchanged.
    // If this ever fails, a re-import can reset a won lead or reassign an owner.
    expect(update).not.toContain("status");
    expect(update).not.toContain("assigned_to");
    expect(update).not.toContain("lead_score");
  });

  it("issues no statement at all when a match has nothing to fill", async () => {
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("from leads")) {
        return {
          rows: [
            { id: "lead-1", contact_name: "Dana", contact_phone: "+852 1", enquiry_text: "hi" },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await commitLeadImport(
      [{ company_name: "Acme Ltd", contact_email: "ops@acme.example", contact_name: "Dana" }],
      "profile-1",
    );

    // Asserted before the counts: the counts alone would throw first and leave this
    // unexercised, and the SQL shape is the thing that actually proves no statement was
    // issued. The leads table has a BEFORE UPDATE trigger on updated_at, so a no-op
    // UPDATE would bump every row of a re-imported list and make it look freshly touched.
    expect(sqlIssued().some((sql) => sql.startsWith("update leads"))).toBe(false);
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it("does not overwrite a stored value with a blank CSV cell", async () => {
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("from leads")) {
        return {
          rows: [
            { id: "lead-1", contact_name: "Dana", contact_phone: "+852 1", enquiry_text: null },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await commitLeadImport(
      [
        {
          company_name: "Acme Ltd",
          contact_email: "ops@acme.example",
          contact_phone: "",
          enquiry_text: "  ",
        },
      ],
      "profile-1",
    );

    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });
});
