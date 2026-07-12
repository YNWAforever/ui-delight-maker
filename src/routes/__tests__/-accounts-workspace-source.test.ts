import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Account company workspace route", () => {
  it("uses the resilient Company Workspace API and renders all workspace sections", () => {
    const source = readFileSync(new URL("../accounts.$id.tsx", import.meta.url), "utf8");

    expect(source).toContain("getCompanyWorkspace");
    expect(source).not.toContain("getEngagementsByClient");
    expect(source).not.toContain("getRelationshipSignals");
    expect(source).not.toContain("getJobSheets");
    expect(source).toContain("Some company sections could not be loaded");
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
