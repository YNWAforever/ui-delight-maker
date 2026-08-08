import { getAccount } from "@/server/repositories/accounts";
import { countAccountContacts, listAccountContacts } from "@/server/repositories/account-contacts";
import { getAccountTimeline } from "@/server/repositories/account-timeline";
import { listClients } from "@/server/repositories/clients";
import {
  getAccountEngagementSummary,
  listEngagementsByAccount,
} from "@/server/repositories/engagements";
import { listJobSheets } from "@/server/repositories/job-sheets";
import { listQuotes, listQuoteSummaries } from "@/server/repositories/quotes";
import { listOpenRelationshipSignalSummary } from "@/server/repositories/relationship-signals";
import { listTasks } from "@/server/repositories/tasks";
import type { CompanyWorkspaceSources } from "./types";

export const neonCompanyWorkspaceSources: CompanyWorkspaceSources = {
  getAccount,
  countAccountContacts,
  listClients: (accountId) => listClients({ account_id: accountId }),
  listOpenRelationshipSignalSummary,
  listQuoteSummaries,
  getAccountEngagementSummary,
  listAccountContacts,
  getAccountTimeline: (accountId) => getAccountTimeline({ accountId }),
  listEngagementsByAccount,
  listQuotes: (accountId) => listQuotes({ account_id: accountId }),
  listTasks: (accountId) => listTasks({ account_id: accountId }),
  listJobSheets: (accountId) => listJobSheets({ account_id: accountId }),
};
