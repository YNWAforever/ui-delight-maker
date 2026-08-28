import { describe, it, expect } from "vitest";
import { buildLeadDedupeKey, parseImportCsv } from "../csv-import";

const HEADER =
  "company_name,industry,tier,owner_email,contact_name,contact_email,product_name,value,billing_period,start_date";

describe("parseImportCsv", () => {
  it("parses rows into objects keyed by header", () => {
    const csv = `${HEADER}\nAcme Ltd,Retail,SME,ada@fimmick.com,Jane Doe,jane@acme.com,CRM Implementation,10000,monthly,2026-01-01`;
    const rows = parseImportCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      company_name: "Acme Ltd",
      owner_email: "ada@fimmick.com",
      value: "10000",
    });
  });

  it("returns an empty array for a header-only file", () => {
    expect(parseImportCsv(HEADER)).toEqual([]);
  });

  it("handles quoted fields containing commas", () => {
    const csv = `${HEADER}\n"Acme, Ltd",Retail,SME,ada@fimmick.com,Jane Doe,jane@acme.com,CRM,10000,monthly,2026-01-01`;
    const rows = parseImportCsv(csv);
    expect(rows[0].company_name).toBe("Acme, Ltd");
  });

  it("handles escaped double-quotes inside a quoted field", () => {
    const csv = `${HEADER}\n"Say ""hi"" Ltd",Retail,SME,ada@fimmick.com,Jane Doe,jane@acme.com,CRM,10000,monthly,2026-01-01`;
    const rows = parseImportCsv(csv);
    expect(rows[0].company_name).toBe('Say "hi" Ltd');
  });
});

describe("buildLeadDedupeKey", () => {
  it("normalises case and surrounding whitespace on both parts", () => {
    // A stored company_name with stray whitespace is a real possibility in this app —
    // client-import.ts documents the same hazard — so both sides are trimmed and lowered.
    expect(buildLeadDedupeKey("  Acme Ltd ", " OPS@Acme.Example ")).toBe(
      buildLeadDedupeKey("acme ltd", "ops@acme.example"),
    );
  });

  it("keeps two contacts at the same company distinct", () => {
    // Several contacts at one company are several legitimate leads, which is why the key
    // is not company alone the way the client key is.
    expect(buildLeadDedupeKey("Acme Ltd", "ops@acme.example")).not.toBe(
      buildLeadDedupeKey("Acme Ltd", "cfo@acme.example"),
    );
  });

  it("keeps the same contact at two companies distinct", () => {
    expect(buildLeadDedupeKey("Acme Ltd", "ops@acme.example")).not.toBe(
      buildLeadDedupeKey("Zephyr Rail", "ops@acme.example"),
    );
  });

  it("cannot be collided by a company name containing the separator", () => {
    // "a<sep>b" + "c" and "a" + "b<sep>c" must not produce the same key.
    expect(buildLeadDedupeKey("a\u0000b", "c")).not.toBe(buildLeadDedupeKey("a", "b\u0000c"));
  });
});
