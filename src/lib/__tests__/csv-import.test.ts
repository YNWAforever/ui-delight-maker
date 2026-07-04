import { describe, it, expect } from "vitest";
import { parseClientImportCsv, validateImportRows } from "../csv-import";

const HEADER = "company_name,industry,tier,owner_email,contact_name,contact_email,product_name,value,billing_period,start_date";

describe("parseClientImportCsv", () => {
  it("parses rows into objects keyed by header", () => {
    const csv = `${HEADER}\nAcme Ltd,Retail,SME,ada@fimmick.com,Jane Doe,jane@acme.com,CRM Implementation,10000,monthly,2026-01-01`;
    const rows = parseClientImportCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ company_name: "Acme Ltd", owner_email: "ada@fimmick.com", value: "10000" });
  });

  it("returns an empty array for a header-only file", () => {
    expect(parseClientImportCsv(HEADER)).toEqual([]);
  });

  it("handles quoted fields containing commas", () => {
    const csv = `${HEADER}\n"Acme, Ltd",Retail,SME,ada@fimmick.com,Jane Doe,jane@acme.com,CRM,10000,monthly,2026-01-01`;
    const rows = parseClientImportCsv(csv);
    expect(rows[0].company_name).toBe("Acme, Ltd");
  });
});

describe("validateImportRows", () => {
  const knownOwners = new Set(["ada@fimmick.com"]);
  const knownProducts = new Set(["CRM Implementation"]);

  it("passes a fully valid row", () => {
    const result = validateImportRows(
      [
        {
          company_name: "Acme Ltd",
          industry: "Retail",
          tier: "SME",
          owner_email: "ada@fimmick.com",
          contact_name: "Jane Doe",
          contact_email: "jane@acme.com",
          product_name: "CRM Implementation",
          value: "10000",
          billing_period: "monthly",
          start_date: "2026-01-01",
        },
      ],
      { knownOwners, knownProducts },
    );
    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it("errors a row with an unresolvable owner email", () => {
    const result = validateImportRows(
      [{ company_name: "Acme Ltd", owner_email: "unknown@fimmick.com", product_name: "CRM Implementation", billing_period: "monthly" }],
      { knownOwners, knownProducts },
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("owner");
  });

  it("errors a row with an unknown product", () => {
    const result = validateImportRows(
      [{ company_name: "Acme Ltd", owner_email: "ada@fimmick.com", product_name: "Nonexistent", billing_period: "monthly" }],
      { knownOwners, knownProducts },
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("product");
  });

  it("errors a row missing a company name", () => {
    const result = validateImportRows(
      [{ company_name: "", owner_email: "ada@fimmick.com", product_name: "CRM Implementation", billing_period: "monthly" }],
      { knownOwners, knownProducts },
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("company");
  });
});
