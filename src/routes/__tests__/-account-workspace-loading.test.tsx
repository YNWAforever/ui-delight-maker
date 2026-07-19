import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getCompanyWorkspaceSectionEnablement } from "@/lib/company-workspace/section-enablement";

describe("Account company workspace loading contract", () => {
  it("keeps optional sections disabled on Overview and People", () => {
    for (const tab of ["overview", "stakeholders"] as const) {
      expect(getCompanyWorkspaceSectionEnablement(tab)).toEqual({
        commercial: false,
        delivery_finance: false,
        activity: false,
        intelligence: false,
      });
    }
  });

  it("enables only the sections required by the active tab", () => {
    expect(getCompanyWorkspaceSectionEnablement("timeline")).toEqual({
      commercial: false,
      delivery_finance: false,
      activity: true,
      intelligence: false,
    });
    expect(getCompanyWorkspaceSectionEnablement("events")).toEqual({
      commercial: true,
      delivery_finance: true,
      activity: true,
      intelligence: false,
    });
    expect(getCompanyWorkspaceSectionEnablement("tasks")).toEqual({
      commercial: true,
      delivery_finance: true,
      activity: false,
      intelligence: false,
    });
  });

  it("loads the lightweight deep read instead of the legacy core-only request", () => {
    const source = readFileSync(new URL("../accounts.$id.tsx", import.meta.url), "utf8");
    expect(source).toContain("getCompanyWorkspaceRead");
    expect(source).not.toContain("getCompanyWorkspaceCore");
  });
});
