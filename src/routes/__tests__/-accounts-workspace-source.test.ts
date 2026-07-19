import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Account company workspace route", () => {
  it("loads Overview data and queries active-tab sections independently", () => {
    const source = readFileSync(new URL("../accounts.$id.tsx", import.meta.url), "utf8");

    expect(source).toContain("getCompanyWorkspaceRead");
    expect(source).not.toContain("getCompanyWorkspace({");
    expect(source).not.toContain("getEngagementsByClient");
    expect(source).not.toContain("getRelationshipSignals");
    expect(source).not.toContain("getJobSheets");
    expect(source).not.toContain("sectionErrors");
    for (const section of ["commercial", "delivery_finance", "activity"]) {
      expect(source).toMatch(
        new RegExp(`useCompanyWorkspaceSection\\(\\s*account\\.id,\\s*"${section}"`),
      );
    }
    expect(source).not.toContain('useCompanyWorkspaceSection(account.id, "intelligence")');
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
