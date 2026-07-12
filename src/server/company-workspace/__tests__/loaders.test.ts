import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  getAccount: vi.fn(),
  listAccountContacts: vi.fn(),
  listClients: vi.fn(),
  listEngagementsByClient: vi.fn(),
  listLeads: vi.fn(),
  listQuotes: vi.fn(),
  listTasks: vi.fn(),
  listJobSheets: vi.fn(),
  getAccountTimeline: vi.fn(),
  listRelationshipSignals: vi.fn(),
}));

vi.mock("@/server/repositories/accounts", () => ({ getAccount: repositories.getAccount }));
vi.mock("@/server/repositories/account-contacts", () => ({
  listAccountContacts: repositories.listAccountContacts,
}));
vi.mock("@/server/repositories/clients", () => ({ listClients: repositories.listClients }));
vi.mock("@/server/repositories/engagements", () => ({
  listEngagementsByClient: repositories.listEngagementsByClient,
}));
vi.mock("@/server/repositories/leads", () => ({ listLeads: repositories.listLeads }));
vi.mock("@/server/repositories/quotes", () => ({ listQuotes: repositories.listQuotes }));
vi.mock("@/server/repositories/tasks", () => ({ listTasks: repositories.listTasks }));
vi.mock("@/server/repositories/job-sheets", () => ({
  listJobSheets: repositories.listJobSheets,
}));
vi.mock("@/server/repositories/account-timeline", () => ({
  getAccountTimeline: repositories.getAccountTimeline,
}));
vi.mock("@/server/repositories/relationship-signals", () => ({
  listRelationshipSignals: repositories.listRelationshipSignals,
}));

import {
  loadCompanyWorkspace,
  loadCompanyWorkspaceCore,
  loadCompanyWorkspaceSection,
} from "../loaders";

describe("Company Workspace loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.getAccount.mockResolvedValue({
      id: "account-1",
      account_owner: "owner-1",
      cs_owner: null,
    });
    repositories.listAccountContacts.mockResolvedValue([{ id: "contact-1" }]);
    repositories.listClients.mockResolvedValue([]);
    repositories.listEngagementsByClient.mockResolvedValue([]);
    repositories.listLeads.mockResolvedValue([]);
    repositories.listQuotes.mockResolvedValue([]);
    repositories.listTasks.mockResolvedValue([]);
    repositories.listJobSheets.mockResolvedValue([]);
    repositories.getAccountTimeline.mockResolvedValue([]);
    repositories.listRelationshipSignals.mockResolvedValue([]);
  });

  it("loads the stable company core separately from optional sections", async () => {
    await expect(loadCompanyWorkspaceCore("account-1")).resolves.toMatchObject({
      company: { id: "account-1" },
      ownership: { accountOwnerId: "owner-1", csOwnerId: null },
      contacts: [{ id: "contact-1" }],
    });
    expect(repositories.listClients).not.toHaveBeenCalled();
  });

  it("loads engagements for every client in the commercial section", async () => {
    repositories.listClients.mockResolvedValue([{ id: "client-1" }, { id: "client-2" }]);
    repositories.listEngagementsByClient
      .mockResolvedValueOnce([{ id: "engagement-1" }])
      .mockResolvedValueOnce([{ id: "engagement-2" }]);

    const result = await loadCompanyWorkspaceSection("account-1", "commercial", "request-1");

    expect(result).toMatchObject({
      status: "ready",
      data: { engagements: [{ id: "engagement-1" }, { id: "engagement-2" }] },
    });
    expect(repositories.listEngagementsByClient).toHaveBeenCalledTimes(2);
  });

  it("isolates an optional schema failure from healthy sections", async () => {
    repositories.getAccountTimeline.mockRejectedValue(
      Object.assign(new Error("missing relation"), { code: "42P01" }),
    );

    const result = await loadCompanyWorkspace("account-1", "request-2");

    expect(result.sections.activity).toEqual({
      status: "error",
      error: {
        code: "schema_mismatch",
        requestId: "request-2",
        retryable: false,
        section: "activity",
      },
    });
    expect(result.sections.commercial.status).toBe("empty");
    expect(result.sections.delivery_finance.status).toBe("empty");
    expect(result.sections.intelligence.status).toBe("empty");
  });
});
