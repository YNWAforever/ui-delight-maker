import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRoute = (name: string) => readFileSync(new URL("../" + name, import.meta.url), "utf8");

describe("relationship detail performance contracts", () => {
  it("loads lead detail through one scoped workspace read", () => {
    const source = readRoute("leads.$id.tsx");

    expect(source).toContain("getLeadWorkspaceRead");
    expect(source).not.toContain("getLead({");
    expect(source).not.toContain("getQuotes({");
    expect(source).toContain("crmQueryKeys.leads.detail");
    expect(source).toContain("useQueryClient");
    expect(source).not.toContain("router.invalidate");
  });

  it("keeps campaign attendees out of the initial loader", () => {
    const source = readRoute("campaigns.$id.tsx");

    expect(source).toContain("getCampaignWorkspaceRead");
    expect(source).toContain("getCampaignWorkspaceSection");
    expect(source).toContain('crmQueryKeys.campaigns.section(campaign.id, "attendees"');
    expect(source).toContain("attendeePage");
    expect(source).toContain("setAttendeePage");
    expect(source).toContain("attendeeQuery.data.total");
    expect(source).not.toContain("getCampaign({");
    expect(source).toContain("useQueryClient");
    expect(source).not.toContain("router.invalidate");
  });

  it("loads a bounded relationship index with server-side open-signal filtering", () => {
    const source = readRoute("relationships.tsx");

    expect(source).toContain("getRelationshipIndexRead");
    expect(source).toContain("crmQueryKeys.relationships.list");
    expect(source).toContain("crmQueryKeys.relationships.lists");
    expect(source).toContain("useQueryClient");
    expect(source).toContain("relationshipPage");
    expect(source).toContain("setRelationshipPage");
    expect(source).toContain("relationshipData.total");
    expect(source).toContain("hiddenSignalCount");
    expect(source).not.toContain("getAccounts({");
    expect(source).not.toContain("getRelationshipSignals({");
  });

  it("declares the relationship dismissal refresh callback", () => {
    const source = readRoute("../components/relationship/relationship-command-center.tsx");

    expect(source).toContain("onDismissed?: () => void");
    expect(source).toContain("onDismissed?.()");
    expect(source).toContain("hiddenSignalCount");
  });

  it("paginates the compact campaign attendee table", () => {
    const source = readRoute("../components/relationship/event-attendee-table.tsx");

    expect(source).toContain("totalCount");
    expect(source).toContain("onPageChange");
    expect(source).toContain("Previous attendee page");
    expect(source).toContain("Next attendee page");
  });

  it("uses mutation-specific query key maps", () => {
    const leadSource = readRoute("leads.$id.tsx");
    const campaignSource = readRoute("campaigns.$id.tsx");

    expect(leadSource).toContain("leadMutationQueryKeys");
    expect(leadSource).toContain("status_change");
    expect(campaignSource).toContain("campaignMutationQueryKeys");
    expect(campaignSource).toContain("attendee_import");
    expect(campaignSource).toContain("follow_up_tasks");
  });
});
