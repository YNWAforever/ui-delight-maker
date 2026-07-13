import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Account company workspace route", () => {
  it("loads core data and queries each optional section independently", () => {
    const source = readFileSync(new URL("../accounts.$id.tsx", import.meta.url), "utf8");

    expect(source).toContain("getCompanyWorkspaceCore");
    expect(source).not.toContain("getCompanyWorkspace({");
    expect(source).not.toContain("getEngagementsByClient");
    expect(source).not.toContain("getRelationshipSignals");
    expect(source).not.toContain("getJobSheets");
    expect(source).not.toContain("sectionErrors");
    for (const section of ["commercial", "delivery_finance", "activity", "intelligence"]) {
      expect(source).toContain(`useCompanyWorkspaceSection(account.id, "${section}")`);
    }
    expect(source).toContain("CompanyWorkspaceSectionState");
    for (const label of ["Overview", "People", "Activity", "Commercial", "Delivery & Finance"]) {
      expect(source).toContain(label);
    }
  });

  it("loads only the stable company core for list previews", () => {
    const source = readFileSync(new URL("../accounts.tsx", import.meta.url), "utf8");

    expect(source).toContain("getCompanyWorkspaceCore");
    expect(source).not.toContain("getAccountWorkspace");
  });
});
