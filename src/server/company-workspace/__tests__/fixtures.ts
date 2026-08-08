import { vi } from "vitest";
import type { CompanyWorkspaceSources } from "../types";

type FakeSources = {
  [Key in keyof CompanyWorkspaceSources]: ReturnType<typeof vi.fn>;
};

export const allowTestUser = () => Promise.resolve({ user: { id: "user-1" } });

export function createFakeSources(overrides: Partial<FakeSources> = {}) {
  const sources: FakeSources = {
    getAccount: vi.fn().mockResolvedValue({ id: "account-1", name: "Acme" }),
    countAccountContacts: vi.fn().mockResolvedValue(0),
    listClients: vi.fn().mockResolvedValue([]),
    listOpenRelationshipSignalSummary: vi.fn().mockResolvedValue({ signals: [], count: 0 }),
    listQuoteSummaries: vi.fn().mockResolvedValue([]),
    getAccountEngagementSummary: vi.fn().mockResolvedValue({ activeCount: 0 }),
    listAccountContacts: vi.fn().mockResolvedValue([]),
    getAccountTimeline: vi.fn().mockResolvedValue([]),
    listEngagementsByAccount: vi.fn().mockResolvedValue([]),
    listQuotes: vi.fn().mockResolvedValue([]),
    listTasks: vi.fn().mockResolvedValue([]),
    listJobSheets: vi.fn().mockResolvedValue([]),
  };

  return { ...sources, ...overrides } as CompanyWorkspaceSources & FakeSources;
}
