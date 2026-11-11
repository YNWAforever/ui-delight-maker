import { describe, expect, it } from "vitest";

import {
  getCompanyWorkspaceSectionEnablement,
  isCompanyWorkspaceTabAllowed,
} from "../section-enablement";

const allowed = {
  commercial: true,
  delivery_finance: true,
  activity: true,
  intelligence: true,
} as const;

const denied = {
  commercial: false,
  delivery_finance: false,
  activity: false,
  intelligence: false,
} as const;

describe("isCompanyWorkspaceTabAllowed", () => {
  it("keeps every tab visible when the flags are absent", () => {
    // A payload from before the flags existed (or a non-authoritative test double) must not
    // hide tabs; the section handler is still the authority on the read itself.
    for (const tab of ["overview", "stakeholders", "timeline", "events", "tasks", "signals"]) {
      expect(isCompanyWorkspaceTabAllowed(tab as never, undefined)).toBe(true);
    }
  });

  it("keeps every tab visible when every section is allowed", () => {
    for (const tab of ["overview", "stakeholders", "timeline", "events", "tasks", "signals"]) {
      expect(isCompanyWorkspaceTabAllowed(tab as never, allowed)).toBe(true);
    }
  });

  it("hides only the tabs whose section data is denied", () => {
    const missingCommercial = { ...allowed, commercial: false } as const;
    expect(isCompanyWorkspaceTabAllowed("overview", missingCommercial)).toBe(true);
    expect(isCompanyWorkspaceTabAllowed("stakeholders", missingCommercial)).toBe(true);
    expect(isCompanyWorkspaceTabAllowed("timeline", missingCommercial)).toBe(true);
    expect(isCompanyWorkspaceTabAllowed("signals", missingCommercial)).toBe(true);
    expect(isCompanyWorkspaceTabAllowed("events", missingCommercial)).toBe(false);
    expect(isCompanyWorkspaceTabAllowed("tasks", missingCommercial)).toBe(false);
  });

  it("hides activity and signal tabs when their own section is denied", () => {
    const missingEngagements = { ...allowed, activity: false } as const;
    expect(isCompanyWorkspaceTabAllowed("timeline", missingEngagements)).toBe(false);
    expect(isCompanyWorkspaceTabAllowed("events", missingEngagements)).toBe(false);
    expect(isCompanyWorkspaceTabAllowed("tasks", missingEngagements)).toBe(true);

    const missingIntelligence = { ...allowed, intelligence: false } as const;
    expect(isCompanyWorkspaceTabAllowed("signals", missingIntelligence)).toBe(false);
    expect(isCompanyWorkspaceTabAllowed("overview", missingIntelligence)).toBe(true);
  });

  it("hides every section tab when all sections are denied", () => {
    const visible = ["overview", "stakeholders", "timeline", "events", "tasks", "signals"].filter(
      (tab) => isCompanyWorkspaceTabAllowed(tab as never, denied),
    );
    expect(visible).toEqual(["overview", "stakeholders"]);
  });

  it("agrees with the enablement map: a required section is exactly an enabled one", () => {
    // The capability map must not drift from the read plan; if a tab starts loading a new
    // section, both functions change together.
    const sectionTabs = ["timeline", "events", "tasks", "signals"] as const;
    for (const tab of sectionTabs) {
      const enablement = getCompanyWorkspaceSectionEnablement(tab);
      for (const [section, enabled] of Object.entries(enablement)) {
        const deniedAccess = { ...allowed, [section]: false } as Record<string, boolean>;
        expect(isCompanyWorkspaceTabAllowed(tab, deniedAccess)).not.toBe(enabled);
      }
    }
  });
});
