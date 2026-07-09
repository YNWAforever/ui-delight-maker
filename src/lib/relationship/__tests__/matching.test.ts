import { describe, expect, it } from "vitest";

import { findAccountMatch, normalizeAccountName, normalizeContactEmail } from "../matching";

describe("relationship matching", () => {
  it("normalizes company names conservatively", () => {
    expect(normalizeAccountName("  Fimmick HK Limited ")).toBe("fimmick hk");
    expect(normalizeAccountName("FIMMICK (Hong Kong) Ltd.")).toBe("fimmick hong kong");
  });

  it("normalizes blank and mixed-case contact emails", () => {
    expect(normalizeContactEmail(" ADA@FIMMICK.COM ")).toBe("ada@fimmick.com");
    expect(normalizeContactEmail(" ")).toBeNull();
    expect(normalizeContactEmail(null)).toBeNull();
  });

  it("matches accounts by normalized name before domain", () => {
    const result = findAccountMatch({
      companyName: "Fimmick HK Limited",
      domain: "fimmick.com",
      accounts: [
        { id: "a1", name: "Fimmick HK", domain: "old.example" },
        { id: "a2", name: "Other", domain: "fimmick.com" },
      ],
    });

    expect(result).toEqual({ kind: "matched", accountId: "a1", matchedBy: "name" });
  });

  it("returns ambiguous when several accounts share the same normalized name", () => {
    const result = findAccountMatch({
      companyName: "Acme Limited",
      accounts: [
        { id: "a1", name: "Acme Ltd", domain: null },
        { id: "a2", name: "Acme Limited", domain: null },
      ],
    });

    expect(result.kind).toBe("ambiguous");
  });

  it("matches accounts by normalized domain when name does not match", () => {
    const result = findAccountMatch({
      companyName: "Different Company",
      domain: "https://www.fimmick.com/hk",
      accounts: [
        { id: "a1", name: "Other", domain: "https://fimmick.com" },
        { id: "a2", name: "Other Two", domain: "other.example" },
      ],
    });

    expect(result).toEqual({ kind: "matched", accountId: "a1", matchedBy: "domain" });
  });

  it("returns ambiguous when several accounts share the same normalized domain", () => {
    const result = findAccountMatch({
      companyName: "Different Company",
      domain: "fimmick.com",
      accounts: [
        { id: "a1", name: "One", domain: "https://www.fimmick.com" },
        { id: "a2", name: "Two", domain: "fimmick.com/path" },
      ],
    });

    expect(result).toEqual({ kind: "ambiguous", accountIds: ["a1", "a2"] });
  });

  it("returns new when no normalized name or domain matches", () => {
    const result = findAccountMatch({
      companyName: "Brand New Co",
      domain: "brandnew.example",
      accounts: [{ id: "a1", name: "Existing", domain: "existing.example" }],
    });

    expect(result).toEqual({ kind: "new" });
  });
});
