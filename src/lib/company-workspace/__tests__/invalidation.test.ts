import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { crmQueryKeys } from "@/lib/query-keys";
import { getCompanyWorkspaceSectionEnablement } from "../section-enablement";
import {
  companyWorkspaceQueryKey,
  getCompanyWorkspaceMutationQueryKeys,
  invalidateCompanyWorkspaceMutation,
  invalidateLinkedCompanyWorkspaceMutation,
} from "../invalidation";

const invalidationFor = (section: string) => ({
  queryKey: ["company-workspace", "account-1", section],
  exact: true,
  refetchType: "active",
});

describe("company workspace mutation invalidation", () => {
  it.each(["dismiss_relationship_signal", "run_relationship_intelligence"] as const)(
    "invalidates overview, intelligence and activity for %s, and nothing else",
    (mutation) => {
      // `activity` was added after this assertion was first written. Both mutations write
      // into the account timeline, which the Activity tab reads under its own key, so
      // without it that tab kept the pre-write state until its stale time lapsed.
      //
      // The "and nothing else" half is the part worth keeping: neither mutation writes a
      // client, engagement, quote, task or job sheet, so commercial and delivery_finance
      // would be a refetch of data that cannot have changed.
      expect(getCompanyWorkspaceMutationQueryKeys("account-1", mutation)).toEqual([
        ["company-workspace", "account-1", "overview"],
        ["company-workspace", "account-1", "intelligence"],
        ["company-workspace", "account-1", "activity"],
      ]);
    },
  );

  it("reaches delivery and finance when a quote is accepted, because a job sheet appears", () => {
    expect(getCompanyWorkspaceMutationQueryKeys("account-1", "accept_quote")).toEqual([
      ["company-workspace", "account-1", "overview"],
      ["company-workspace", "account-1", "commercial"],
      ["company-workspace", "account-1", "delivery_finance"],
      ["company-workspace", "account-1", "activity"],
    ]);
  });

  it("leaves delivery and finance alone when a quote changes without acceptance", () => {
    expect(getCompanyWorkspaceMutationQueryKeys("account-1", "change_quote")).toEqual([
      ["company-workspace", "account-1", "overview"],
      ["company-workspace", "account-1", "commercial"],
      ["company-workspace", "account-1", "activity"],
    ]);
  });

  it("invalidates delivery and finance for a task change, and not the commercial section", () => {
    expect(getCompanyWorkspaceMutationQueryKeys("account-1", "change_task")).toEqual([
      ["company-workspace", "account-1", "delivery_finance"],
      ["company-workspace", "account-1", "activity"],
    ]);
  });

  it("builds stable account-and-section keys", () => {
    expect(companyWorkspaceQueryKey("account-1", "commercial")).toEqual([
      "company-workspace",
      "account-1",
      "commercial",
    ]);
  });

  it("invalidates every affected target exactly, and only for active observers", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

    await invalidateCompanyWorkspaceMutation(queryClient, "account-1", "accept_quote");

    expect(invalidateQueries.mock.calls.map(([args]) => args)).toEqual([
      invalidationFor("overview"),
      invalidationFor("commercial"),
      invalidationFor("delivery_finance"),
      invalidationFor("activity"),
    ]);
  });
});

describe("linked company workspace invalidation", () => {
  it.each([null, undefined, ""])(
    "does not invalidate when the record has no company (%p)",
    async (accountId) => {
      const queryClient = new QueryClient();
      const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

      await invalidateLinkedCompanyWorkspaceMutation(queryClient, accountId, "change_task");

      expect(invalidateQueries).not.toHaveBeenCalled();
    },
  );

  it("invalidates the linked company's workspace when the record carries an account", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

    await invalidateLinkedCompanyWorkspaceMutation(queryClient, "account-1", "change_task");

    expect(invalidateQueries.mock.calls.map(([args]) => args)).toEqual([
      invalidationFor("delivery_finance"),
      invalidationFor("activity"),
    ]);
  });
});

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
