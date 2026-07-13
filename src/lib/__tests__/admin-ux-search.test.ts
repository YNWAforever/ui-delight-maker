import { describe, expect, it } from "vitest";

import {
  ACCOUNT_DETAIL_TABS,
  accountDetailSearchSchema,
  AGENT_DETAIL_TABS,
  agentDetailSearchSchema,
  CLIENT_DETAIL_TABS,
  clientDetailSearchSchema,
  companySortFromKey,
  companySortToKey,
  companiesSearchSchema,
  LEAD_DETAIL_TABS,
  leadDetailSearchSchema,
  QUOTE_DETAIL_TABS,
  quoteDetailSearchSchema,
  revenueDeskSearchSchema,
  pipelineFiltersFromSearch,
  pipelineSearchFromFilters,
  SETTINGS_TABS,
  settingsSearchSchema,
} from "../admin-ux-search";

describe("admin search contracts", () => {
  it("accepts Revenue Desk filters and maps them to pipeline filters", () => {
    const search = revenueDeskSearchSchema.parse({
      q: "northstar",
      source: "event",
      owner: "user-1",
      urgency: "overdue",
      ai: "ready_for_review",
      lead: "lead-2",
    });

    expect(pipelineFiltersFromSearch(search)).toEqual({
      search: "northstar",
      source: "event",
      owner: "user-1",
      urgency: "overdue",
      aiState: "ready_for_review",
    });
    expect(search.lead).toBe("lead-2");
  });

  it("omits default Revenue Desk filters when serializing", () => {
    expect(
      pipelineSearchFromFilters({
        search: "",
        source: "all",
        owner: "all",
        urgency: "all",
        aiState: "all",
      }),
    ).toEqual({});

    expect(pipelineFiltersFromSearch(revenueDeskSearchSchema.parse({}))).toEqual({
      search: "",
      source: "all",
      owner: "all",
      urgency: "all",
      aiState: "all",
    });
  });

  it("falls back safely for invalid Revenue and Companies values", () => {
    expect(revenueDeskSearchSchema.parse({ source: "obsolete", urgency: "later", ai: "old" })).toEqual({});
    expect(companiesSearchSchema.parse({ lifecycle: "obsolete", sort: "old", account: "" })).toEqual({});
  });

  it("accepts every current company lifecycle and sort value", () => {
    for (const lifecycle of ["prospect", "active_client", "at_risk", "churned", "partner", "vendor"]) {
      expect(companiesSearchSchema.parse({ lifecycle }).lifecycle).toBe(lifecycle);
    }

    for (const sort of [
      "last_activity_at:desc",
      "name:asc",
      "relationship_health:asc",
      "relationship_health:desc",
    ] as const) {
      expect(companiesSearchSchema.parse({ sort }).sort).toBe(sort);
    }
  });

  it("uses recent activity as the omitted company sort and omits that default", () => {
    const recent = { field: "last_activity_at", direction: "desc" } as const;
    expect(companySortFromKey()).toEqual(recent);
    expect(companySortToKey(recent)).toBeUndefined();
    expect(companySortToKey({ field: "name", direction: "asc" })).toBe("name:asc");
  });

  it("accepts every current detail tab and safely rejects obsolete tabs", () => {
    const schemas = [
      [accountDetailSearchSchema, ACCOUNT_DETAIL_TABS],
      [leadDetailSearchSchema, LEAD_DETAIL_TABS],
      [clientDetailSearchSchema, CLIENT_DETAIL_TABS],
      [quoteDetailSearchSchema, QUOTE_DETAIL_TABS],
      [agentDetailSearchSchema, AGENT_DETAIL_TABS],
      [settingsSearchSchema, SETTINGS_TABS],
    ] as const;

    for (const [schema, tabs] of schemas) {
      for (const tab of tabs) expect(schema.parse({ tab }).tab).toBe(tab);
      expect(schema.parse({ tab: "obsolete" })).toEqual({});
    }
  });

  it("preserves quote edit and approval state with quote tabs", () => {
    expect(
      quoteDetailSearchSchema.parse({ edit: true, approvalId: "approval-1", tab: "preview" }),
    ).toEqual({ edit: true, approvalId: "approval-1", tab: "preview" });
  });
});
