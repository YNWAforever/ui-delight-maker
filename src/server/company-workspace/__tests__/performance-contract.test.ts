import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ENGAGEMENT_QUERIES_PER_WORKSPACE } from "../../../../scripts/clientops/measure-company-workspace";

const repositories = vi.hoisted(() => ({
  getAccountTimeline: vi.fn(),
  listAccountContacts: vi.fn(),
  getAccount: vi.fn(),
  listClients: vi.fn(),
  listEngagementsByClient: vi.fn(),
  listJobSheets: vi.fn(),
  listLeads: vi.fn(),
  listQuotes: vi.fn(),
  listRelationshipSignals: vi.fn(),
  listTasks: vi.fn(),
}));

vi.mock("@/server/repositories/account-timeline", () => ({
  getAccountTimeline: repositories.getAccountTimeline,
}));
vi.mock("@/server/repositories/account-contacts", () => ({
  listAccountContacts: repositories.listAccountContacts,
}));
vi.mock("@/server/repositories/accounts", () => ({ getAccount: repositories.getAccount }));
vi.mock("@/server/repositories/clients", () => ({ listClients: repositories.listClients }));
vi.mock("@/server/repositories/engagements", () => ({
  listEngagementsByClient: repositories.listEngagementsByClient,
}));
vi.mock("@/server/repositories/job-sheets", () => ({ listJobSheets: repositories.listJobSheets }));
vi.mock("@/server/repositories/leads", () => ({ listLeads: repositories.listLeads }));
vi.mock("@/server/repositories/quotes", () => ({ listQuotes: repositories.listQuotes }));
vi.mock("@/server/repositories/relationship-signals", () => ({
  listRelationshipSignals: repositories.listRelationshipSignals,
}));
vi.mock("@/server/repositories/tasks", () => ({ listTasks: repositories.listTasks }));

import { loadCompanyWorkspaceSection } from "../loaders";

describe("Company Workspace performance contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.listClients.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => ({ id: `client-${index + 1}` })),
    );
    repositories.listEngagementsByClient.mockResolvedValue([]);
    repositories.listLeads.mockResolvedValue([]);
    repositories.listQuotes.mockResolvedValue([]);
  });

  it.fails("bounds engagement loading to one query regardless of client count", async () => {
    await loadCompanyWorkspaceSection("account-1", "commercial", "request-1");

    expect(repositories.listEngagementsByClient).toHaveBeenCalledTimes(
      MAX_ENGAGEMENT_QUERIES_PER_WORKSPACE,
    );
  });
});
