import type {
  Account,
  AccountContact,
  Client,
  Engagement,
  JobSheet,
  Quote,
  RelationshipSignal,
  Task,
} from "@/lib/types";
import type { AccountTimelineEntry } from "@/lib/relationship/types";
import type { QuoteSummary } from "@/lib/company-workspace/types";

export type CompanyWorkspaceSources = {
  getAccount: (accountId: string) => Promise<Account>;
  countAccountContacts: (accountId: string) => Promise<number>;
  listClients: (accountId: string) => Promise<Client[]>;
  listOpenRelationshipSignalSummary: (
    accountId: string,
    limit: number,
  ) => Promise<{ signals: RelationshipSignal[]; count: number }>;
  listQuoteSummaries: (accountId: string) => Promise<QuoteSummary[]>;
  getAccountEngagementSummary: (accountId: string) => Promise<{ activeCount: number }>;
  listAccountContacts: (accountId: string) => Promise<AccountContact[]>;
  getAccountTimeline: (accountId: string) => Promise<AccountTimelineEntry[]>;
  listEngagementsByAccount: (accountId: string) => Promise<Engagement[]>;
  listQuotes: (accountId: string) => Promise<Quote[]>;
  listTasks: (accountId: string) => Promise<Task[]>;
  listJobSheets: (accountId: string) => Promise<JobSheet[]>;
};
