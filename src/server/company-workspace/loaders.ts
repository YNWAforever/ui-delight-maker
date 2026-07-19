import { getAccountTimeline } from "@/server/repositories/account-timeline";
import { listAccountContacts } from "@/server/repositories/account-contacts";
import { getAccount } from "@/server/repositories/accounts";
import {
  getCompanyWorkspaceOverviewMetrics,
  listCompanyWorkspaceQuoteTotals,
} from "@/server/repositories/company-workspace";
import { listClients } from "@/server/repositories/clients";
import { listEngagementsByClient } from "@/server/repositories/engagements";
import { listJobSheets } from "@/server/repositories/job-sheets";
import { listLeads } from "@/server/repositories/leads";
import { listQuotes } from "@/server/repositories/quotes";
import { listRelationshipSignals } from "@/server/repositories/relationship-signals";
import { listTasks } from "@/server/repositories/tasks";
import { toCompanyWorkspaceError } from "./errors";
import type {
  CompanyWorkspace,
  CompanyWorkspaceCore,
  CompanyWorkspaceOverview,
  CompanyWorkspaceRead,
  CompanyWorkspaceSection,
  CompanyWorkspaceSectionData,
  SectionState,
} from "./types";

const sections: CompanyWorkspaceSection[] = [
  "commercial",
  "delivery_finance",
  "activity",
  "intelligence",
];

export async function loadCompanyWorkspaceCore(accountId: string): Promise<CompanyWorkspaceCore> {
  const [company, contacts] = await Promise.all([
    getAccount(accountId),
    listAccountContacts(accountId),
  ]);
  return {
    company,
    ownership: {
      accountOwnerId: company.account_owner ?? null,
      csOwnerId: company.cs_owner ?? null,
    },
    contacts,
  };
}

async function loadCompanyWorkspaceOverview(
  accountId: string,
  requestId: string,
): Promise<SectionState<CompanyWorkspaceOverview>> {
  try {
    const [metrics, quoteTotals, signals] = await Promise.all([
      getCompanyWorkspaceOverviewMetrics(accountId),
      listCompanyWorkspaceQuoteTotals(accountId),
      listRelationshipSignals({ account_id: accountId, openOnly: true }),
    ]);
    return {
      status: "ready",
      data: {
        linkedClientCount: metrics.linked_client_count,
        activeEngagementCount: metrics.active_engagement_count,
        quoteCount: metrics.quote_count,
        quoteTotals: quoteTotals.map((total) => ({
          currency: total.currency,
          quoteCount: total.quote_count,
          totalValue: total.total_value,
        })),
        openSignalCount: metrics.open_signal_count,
        openSignals: signals.slice(0, 5),
      },
    };
  } catch (error) {
    return { status: "error", error: toCompanyWorkspaceError(error, undefined, requestId) };
  }
}

async function loadSectionData<Section extends CompanyWorkspaceSection>(
  accountId: string,
  section: Section,
): Promise<CompanyWorkspaceSectionData[Section]> {
  if (section === "commercial") {
    const [clients, leads, quotes] = await Promise.all([
      listClients({ account_id: accountId }),
      listLeads({ account_id: accountId }),
      listQuotes({ account_id: accountId }),
    ]);
    const engagements = (
      await Promise.all(clients.map((client) => listEngagementsByClient(client.id)))
    ).flat();
    return {
      clients,
      engagements,
      leads,
      quotes,
    } as unknown as CompanyWorkspaceSectionData[Section];
  }
  if (section === "delivery_finance") {
    const [tasks, jobSheets] = await Promise.all([
      listTasks({ account_id: accountId }),
      listJobSheets({ account_id: accountId }),
    ]);
    return { tasks, jobSheets } as CompanyWorkspaceSectionData[Section];
  }
  if (section === "activity") {
    const timeline = await getAccountTimeline({ accountId });
    return { timeline } as CompanyWorkspaceSectionData[Section];
  }
  const signals = await listRelationshipSignals({ account_id: accountId, openOnly: true });
  return { signals } as CompanyWorkspaceSectionData[Section];
}

function isEmptySection(data: CompanyWorkspaceSectionData[CompanyWorkspaceSection]) {
  return Object.values(data).every((value) => Array.isArray(value) && value.length === 0);
}

export async function loadCompanyWorkspaceSection<Section extends CompanyWorkspaceSection>(
  accountId: string,
  section: Section,
  requestId: string = crypto.randomUUID(),
): Promise<SectionState<CompanyWorkspaceSectionData[Section]>> {
  try {
    const data = await loadSectionData(accountId, section);
    return { status: isEmptySection(data) ? "empty" : "ready", data };
  } catch (error) {
    return { status: "error", error: toCompanyWorkspaceError(error, section, requestId) };
  }
}

export async function loadCompanyWorkspaceRead(
  accountId: string,
  requestedSections: CompanyWorkspaceSection[] = [],
  requestId: string = crypto.randomUUID(),
  now: () => Date = () => new Date(),
): Promise<CompanyWorkspaceRead> {
  const cacheMetadata = { fetchedAt: now().toISOString(), freshForMs: 30_000 };
  const [core, overview, sectionEntries] = await Promise.all([
    loadCompanyWorkspaceCore(accountId),
    loadCompanyWorkspaceOverview(accountId, requestId),
    Promise.all(
      requestedSections.map(
        async (section) =>
          [section, await loadCompanyWorkspaceSection(accountId, section, requestId)] as const,
      ),
    ),
  ]);

  return {
    requestId,
    core,
    overview,
    sections: Object.fromEntries(sectionEntries),
    cache: {
      core: cacheMetadata,
      overview: cacheMetadata,
      sections: Object.fromEntries(requestedSections.map((section) => [section, cacheMetadata])),
    },
  };
}

export async function loadCompanyWorkspace(
  accountId: string,
  requestId: string = crypto.randomUUID(),
): Promise<CompanyWorkspace> {
  const core = await loadCompanyWorkspaceCore(accountId);
  const sectionResults = await Promise.all(
    sections.map((section) => loadCompanyWorkspaceSection(accountId, section, requestId)),
  );
  return {
    core,
    sections: {
      commercial: sectionResults[0] as CompanyWorkspace["sections"]["commercial"],
      delivery_finance: sectionResults[1] as CompanyWorkspace["sections"]["delivery_finance"],
      activity: sectionResults[2] as CompanyWorkspace["sections"]["activity"],
      intelligence: sectionResults[3] as CompanyWorkspace["sections"]["intelligence"],
    },
  };
}
