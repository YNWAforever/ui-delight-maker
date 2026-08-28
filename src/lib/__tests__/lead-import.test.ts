import { describe, expect, it } from "vitest";

import { validateLeadImportRows } from "../lead-import";

const CONTEXT = { knownOwners: new Set(["rep@fimmick.example"]) };

const row = (over: Record<string, string> = {}) => ({
  company_name: "Acme Ltd",
  contact_email: "ops@acme.example",
  ...over,
});

describe("validateLeadImportRows", () => {
  it("accepts a minimal valid row", () => {
    const { valid, errors } = validateLeadImportRows([row()], CONTEXT);
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
  });

  it("rejects a row with no company name", () => {
    const { valid, errors } = validateLeadImportRows([row({ company_name: "  " })], CONTEXT);
    expect(valid).toEqual([]);
    expect(errors[0].reason).toBe("Missing company name");
  });

  it("rejects a row with no email, because it is half the dedupe key", () => {
    const { valid, errors } = validateLeadImportRows([row({ contact_email: "" })], CONTEXT);
    expect(valid).toEqual([]);
    expect(errors[0].reason).toBe("Missing contact email");
  });

  it("rejects a malformed email", () => {
    for (const contact_email of ["acme.example", "ops@", "@acme.example", "ops@acme"]) {
      const { valid, errors } = validateLeadImportRows([row({ contact_email })], CONTEXT);
      expect(valid, contact_email).toEqual([]);
      expect(errors[0].reason, contact_email).toBe(`Malformed contact email: ${contact_email}`);
    }
  });

  it("accepts an email a stricter pattern would wrongly reject", () => {
    // Deliverability is not knowable here. An over-strict pattern turns a working import
    // into a support question, so the check is shape only.
    for (const contact_email of ["a+tag@sub.acme.example", "o'brien@acme.example"]) {
      const { errors } = validateLeadImportRows([row({ contact_email })], CONTEXT);
      expect(errors, contact_email).toEqual([]);
    }
  });

  it("rejects an owner email that does not resolve", () => {
    const { valid, errors } = validateLeadImportRows(
      [row({ owner_email: "ghost@fimmick.example" })],
      CONTEXT,
    );
    expect(valid).toEqual([]);
    expect(errors[0].reason).toBe("Unresolvable owner email: ghost@fimmick.example");
  });

  it("accepts a blank owner email", () => {
    const { errors } = validateLeadImportRows([row({ owner_email: "" })], CONTEXT);
    expect(errors).toEqual([]);
  });

  it("rejects a key repeated within the same file", () => {
    // Keeping the first or last occurrence silently would make one file produce different
    // results depending on row order.
    const { valid, errors } = validateLeadImportRows(
      [row(), row({ contact_email: "OPS@ACME.EXAMPLE" })],
      CONTEXT,
    );
    expect(valid).toHaveLength(1);
    expect(errors[0].reason).toBe("Duplicate of an earlier row in this file");
  });
});
