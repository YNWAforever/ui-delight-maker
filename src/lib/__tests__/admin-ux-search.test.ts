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
  it("accepts every Revenue Desk source, urgency, and AI value", () => {
    const sources = ["website", "whatsapp", "email", "linkedin", "csv", "event", "manual"] as const;
    const urgencies = ["overdue", "due_today", "clear"] as const;
    const aiStates = ["running", "ready_for_review", "approved", "sent", "failed", "idle"] as const;

    for (const source of sources) {
      expect(revenueDeskSearchSchema.parse({ source }).source).toBe(source);
      expect(pipelineSearchFromFilters({ source })).toEqual({ source });
    }
    for (const urgency of urgencies) {
      expect(revenueDeskSearchSchema.parse({ urgency }).urgency).toBe(urgency);
      expect(pipelineSearchFromFilters({ urgency })).toEqual({ urgency });
    }
    for (const aiState of aiStates) {
      expect(revenueDeskSearchSchema.parse({ ai: aiState }).ai).toBe(aiState);
      expect(pipelineSearchFromFilters({ aiState })).toEqual({ ai: aiState });
    }
  });

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
    expect(
      pipelineSearchFromFilters({
        search: "northstar",
        source: "event",
        owner: "user-1",
        urgency: "overdue",
        aiState: "ready_for_review",
      }),
    ).toEqual({
      q: "northstar",
      source: "event",
      owner: "user-1",
      urgency: "overdue",
      ai: "ready_for_review",
    });
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
    expect(
      revenueDeskSearchSchema.parse({ source: "obsolete", urgency: "later", ai: "old" }),
    ).toEqual({});
    expect(
      companiesSearchSchema.parse({ lifecycle: "obsolete", sort: "old", account: "" }),
    ).toEqual({ lifecycle: undefined, sort: undefined, account: undefined, page: 1, limit: 50 });
  });

  it("accepts every current company lifecycle, sort, and account selection value", () => {
    for (const lifecycle of [
      "prospect",
      "active_client",
      "at_risk",
      "churned",
      "partner",
      "vendor",
    ]) {
      expect(companiesSearchSchema.parse({ lifecycle }).lifecycle).toBe(lifecycle);
    }
    for (const account of ["account-1", "account-2"]) {
      expect(companiesSearchSchema.parse({ account }).account).toBe(account);
    }
  });

  it("converts every company sort pair and omits the default", () => {
    const sortCases = [
      {
        key: "last_activity_at:desc" as const,
        sort: { field: "last_activity_at", direction: "desc" } as const,
        serialized: undefined,
      },
      {
        key: "name:asc" as const,
        sort: { field: "name", direction: "asc" } as const,
        serialized: "name:asc" as const,
      },
      {
        key: "relationship_health:asc" as const,
        sort: { field: "relationship_health", direction: "asc" } as const,
        serialized: "relationship_health:asc" as const,
      },
      {
        key: "relationship_health:desc" as const,
        sort: { field: "relationship_health", direction: "desc" } as const,
        serialized: "relationship_health:desc" as const,
      },
    ];

    for (const item of sortCases) {
      expect(companiesSearchSchema.parse({ sort: item.key }).sort).toBe(item.key);
      expect(companySortFromKey(item.key)).toEqual(item.sort);
      expect(companySortToKey(item.sort)).toBe(item.serialized);
    }
    expect(companySortFromKey()).toEqual(sortCases[0].sort);
  });

  it("preserves unrelated search keys through relevant schemas", () => {
    expect(revenueDeskSearchSchema.parse({ q: "northstar", unrelated: "keep" }).unrelated).toBe(
      "keep",
    );
    expect(companiesSearchSchema.parse({ account: "account-1", unrelated: "keep" }).unrelated).toBe(
      "keep",
    );
    expect(quoteDetailSearchSchema.parse({ tab: "preview", unrelated: "keep" }).unrelated).toBe(
      "keep",
    );
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
      expect(schema.parse({ tab: tabs[0], unrelated: "keep" }).unrelated).toBe("keep");
    }
  });

  it("preserves quote edit and approval state with quote tabs", () => {
    expect(
      quoteDetailSearchSchema.parse({ edit: true, approvalId: "approval-1", tab: "preview" }),
    ).toEqual({ edit: true, approvalId: "approval-1", tab: "preview" });
  });
});
