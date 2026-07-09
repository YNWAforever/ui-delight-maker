import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRoute = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("approvals inbox quote-send lifecycle source", () => {
  it("issues quote-send approvals through the dedicated quote workflow", () => {
    const source = readRoute("approvals.tsx");

    expect(source).toContain("approveAndIssueQuote");
    expect(source).toContain("await approveAndIssueQuote({");
    expect(source).not.toContain('"Approved as-is ??quote advanced"');
  });

  it("rejects quote-send approvals through the dedicated quote workflow", () => {
    const source = readRoute("approvals.tsx");

    expect(source).toContain("rejectQuote");
    expect(source).toContain("await rejectQuote({");
    expect(source).toContain("rejectSelectedApproval(selected)");
  });
});
