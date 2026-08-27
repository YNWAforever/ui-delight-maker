import { describe, expect, it } from "vitest";

import { crmQueryKeys } from "@/lib/query-keys";
import { getCompanyWorkspaceMutationQueryKeys } from "../invalidation";
import { getCompanyWorkspaceSectionEnablement } from "../section-enablement";

/**
 * The two halves of one defect.
 *
 * Account 360's signal mutations invalidated `overview` and `intelligence`. `activity` — the
 * tab a dismissal and a relationship-intelligence run both write into — was never
 * invalidated, so the timeline kept the pre-write state until its 30s stale time lapsed.
 * `intelligence` had the opposite problem: no tab enabled that section, so the key had no
 * consumer and invalidating it did nothing at all.
 *
 * These assertions are paired deliberately: a fix that removed the dead key without adding
 * the missing one, or that added a consumer for `intelligence` without invalidating
 * `activity`, would still leave a user looking at stale state.
 */
describe("Company Workspace mutation invalidation", () => {
  const activityKey = crmQueryKeys.companyWorkspace.section("account-1", "activity");
  const intelligenceKey = crmQueryKeys.companyWorkspace.section("account-1", "intelligence");
  const overviewKey = crmQueryKeys.companyWorkspace.section("account-1", "overview");

  it("refreshes Activity after a signal dismissal", () => {
    const keys = getCompanyWorkspaceMutationQueryKeys("account-1", "dismiss_relationship_signal");

    expect(keys).toContainEqual(activityKey);
    expect(keys).toContainEqual(overviewKey);
    expect(keys).toContainEqual(intelligenceKey);
  });

  it("refreshes Activity after a relationship-intelligence run", () => {
    const keys = getCompanyWorkspaceMutationQueryKeys("account-1", "run_relationship_intelligence");

    expect(keys).toContainEqual(activityKey);
    expect(keys).toContainEqual(overviewKey);
    expect(keys).toContainEqual(intelligenceKey);
  });

  it("refreshes only the read a stakeholder write can change", () => {
    // Contacts arrive with the overview read. A contact write cannot move a quote, a job
    // sheet or an engagement, so those sections are deliberately left alone.
    expect(getCompanyWorkspaceMutationQueryKeys("account-1", "account_contact")).toEqual([
      overviewKey,
    ]);
  });

  it("keeps every invalidated section reachable by some tab", () => {
    // A key nothing subscribes to is a no-op dressed as a refresh. Every target these
    // mutations name has to be a section some tab actually enables.
    const tabs = ["overview", "stakeholders", "timeline", "events", "tasks", "signals"] as const;
    const enabledSections = new Set<string>(["overview"]);
    for (const tab of tabs) {
      for (const [section, enabled] of Object.entries(getCompanyWorkspaceSectionEnablement(tab))) {
        if (enabled) enabledSections.add(section);
      }
    }

    for (const mutation of [
      "dismiss_relationship_signal",
      "run_relationship_intelligence",
      "account_contact",
    ] as const) {
      for (const key of getCompanyWorkspaceMutationQueryKeys("account-1", mutation)) {
        expect(enabledSections).toContain(String(key[2]));
      }
    }
  });

  it("gives the intelligence section the Signals tab as its consumer", () => {
    expect(getCompanyWorkspaceSectionEnablement("signals")).toEqual({
      commercial: false,
      delivery_finance: false,
      activity: false,
      intelligence: true,
    });
  });
});
