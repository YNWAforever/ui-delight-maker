import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  getAccount: vi.fn(),
  listAccountContacts: vi.fn(),
  getCompanyWorkspaceOverviewMetrics: vi.fn(),
  listRelationshipSignals: vi.fn(),
  getAccountTimeline: vi.fn(),
  listClients: vi.fn(),
  listEngagementsByClient: vi.fn(),
  listJobSheets: vi.fn(),
  listLeads: vi.fn(),
  listQuotes: vi.fn(),
  listTasks: vi.fn(),
}));

vi.mock("@/server/repositories/accounts", () => ({ getAccount: repositories.getAccount }));
vi.mock("@/server/repositories/account-contacts", () => ({
  listAccountContacts: repositories.listAccountContacts,
}));
vi.mock("@/server/repositories/company-workspace", () => ({
  getCompanyWorkspaceOverviewMetrics: repositories.getCompanyWorkspaceOverviewMetrics,
}));
vi.mock("@/server/repositories/relationship-signals", () => ({
  listRelationshipSignals: repositories.listRelationshipSignals,
}));
vi.mock("@/server/repositories/account-timeline", () => ({
  getAccountTimeline: repositories.getAccountTimeline,
}));
vi.mock("@/server/repositories/clients", () => ({ listClients: repositories.listClients }));
vi.mock("@/server/repositories/engagements", () => ({
  listEngagementsByClient: repositories.listEngagementsByClient,
}));
vi.mock("@/server/repositories/job-sheets", () => ({ listJobSheets: repositories.listJobSheets }));
vi.mock("@/server/repositories/leads", () => ({ listLeads: repositories.listLeads }));
vi.mock("@/server/repositories/quotes", () => ({ listQuotes: repositories.listQuotes }));
vi.mock("@/server/repositories/tasks", () => ({ listTasks: repositories.listTasks }));

import { loadCompanyWorkspaceRead } from "../loaders";

describe("Company Workspace read model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.getAccount.mockResolvedValue({
      id: "account-1",
      account_owner: null,
      cs_owner: null,
    });
    repositories.listAccountContacts.mockResolvedValue([]);
    repositories.getCompanyWorkspaceOverviewMetrics.mockResolvedValue({
      linked_client_count: 3,
      active_engagement_count: 2,
      quote_count: 4,
      quote_total_value: 1200,
      quote_currency: "HKD",
      open_signal_count: 1,
    });
    repositories.listRelationshipSignals.mockResolvedValue([{ id: "signal-1" }]);
    repositories.getAccountTimeline.mockResolvedValue([{ id: "event-1" }]);
  });

  it("loads core, Overview, and only the explicitly requested optional sections", async () => {
    const result = await loadCompanyWorkspaceRead("account-1", ["activity"], "request-1");

    expect(result).toMatchObject({
      requestId: "request-1",
      core: { company: { id: "account-1" } },
      overview: {
        status: "ready",
        data: { linkedClientCount: 3, openSignals: [{ id: "signal-1" }] },
      },
      sections: { activity: { status: "ready", data: { timeline: [{ id: "event-1" }] } } },
    });
    expect(Object.keys(result.sections)).toEqual(["activity"]);
    expect(repositories.listClients).not.toHaveBeenCalled();
  });
});
