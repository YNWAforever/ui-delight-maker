import { describe, it, expect } from "vitest";
import { validateClientImportRows } from "../client-import";

describe("validateClientImportRows", () => {
  const knownOwners = new Set(["ada@fimmick.com"]);
  const knownProducts = new Set(["CRM Implementation"]);

  it("passes a fully valid row", () => {
    const result = validateClientImportRows(
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
    const result = validateClientImportRows(
      [
        {
          company_name: "Acme Ltd",
          owner_email: "unknown@fimmick.com",
          product_name: "CRM Implementation",
          billing_period: "monthly",
        },
      ],
      { knownOwners, knownProducts },
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("owner");
  });

  it("errors a row with an unknown product", () => {
    const result = validateClientImportRows(
      [
        {
          company_name: "Acme Ltd",
          owner_email: "ada@fimmick.com",
          product_name: "Nonexistent",
          billing_period: "monthly",
        },
      ],
      { knownOwners, knownProducts },
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("product");
  });

  it("errors a row missing a company name", () => {
    const result = validateClientImportRows(
      [
        {
          company_name: "",
          owner_email: "ada@fimmick.com",
          product_name: "CRM Implementation",
          billing_period: "monthly",
        },
      ],
      { knownOwners, knownProducts },
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("company");
  });
});
