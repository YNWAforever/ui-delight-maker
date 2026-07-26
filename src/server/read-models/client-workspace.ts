import type {
  ActivityLog,
  Client,
  ClientContact,
  Engagement,
  JobSheet,
  Quote,
  RenewalRisk,
} from "@/lib/types";
import { queryOne } from "@/server/db/neon.server";
import { serializeActivityLog, type SerializableActivityLog } from "@/lib/serializable";
import { listActivityLogsByClientAndEngagementIds } from "@/server/repositories/activity-logs";
import { listClientContacts } from "@/server/repositories/client-contacts";
import { getClient } from "@/server/repositories/clients";
import { listEngagementsByClient } from "@/server/repositories/engagements";
import { listJobSheets } from "@/server/repositories/job-sheets";
import { listQuotes } from "@/server/repositories/quotes";

export const clientWorkspaceSections = [
  "contacts",
  "activity",
  "commercial",
  "engagements",
  "job_sheets",
] as const;

export type ClientWorkspaceSection = (typeof clientWorkspaceSections)[number];

export type ClientWorkspaceSectionData = {
  contacts: { contacts: ClientContact[] };
  activity: { activityLogs: SerializableActivityLog[] };
  commercial: { quotes: Quote[] };
  engagements: { engagements: Engagement[] };
  job_sheets: { jobSheets: JobSheet[] };
};

export type ClientWorkspaceSectionState<T> =
  | { status: "ready"; data: T }
  | { status: "empty"; data: T }
  | {
      status: "error";
      error: {
        code: "query_failed";
        requestId: string;
        retryable: true;
        section: ClientWorkspaceSection;
      };
    };

export type ClientWorkspaceRead = {
  requestId: string;
  identity: {
    id: string;
    accountId: string | null;
    primaryContactId: string | null;
    companyName: string;
    industry: string | null;
    tier: Client["tier"];
    createdAt: string;
  };
  ownership: { accountOwnerId: string | null };
  relationship: {
    healthScore: number;
    onboardingStatus: string;
    renewalDate: string | null;
    renewalRisk: RenewalRisk | null;
    arr: number | null;
  };
  counts: {
    contacts: number | null;
    engagements: number | null;
    quotes: number | null;
    jobSheets: number | null;
  };
};

type ClientCountRow = {
  contact_count: number | string | null;
  engagement_count: number | string | null;
  quote_count: number | string | null;
  job_sheet_count: number | string | null;
};

const parseCount = (value: number | string | null | undefined) =>
  value == null ? null : Number(value);

export type ClientWorkspaceVisibility = {
  contacts: boolean;
  engagements: boolean;
  quotes: boolean;
  jobSheets: boolean;
};

const allClientWorkspaceCountsVisible: ClientWorkspaceVisibility = {
  contacts: true,
  engagements: true,
  quotes: true,
  jobSheets: true,
};

async function getClientWorkspaceCounts(clientId: string, visibility: ClientWorkspaceVisibility) {
  const row = await queryOne<ClientCountRow>(
    `
      select
        case when $2::boolean then (select count(*) from client_contacts where client_id = $1) else null end as contact_count,
        case when $3::boolean then (select count(*) from engagements where client_id = $1) else null end as engagement_count,
        case when $4::boolean then (select count(*) from quotes where client_id = $1) else null end as quote_count,
        case when $5::boolean then (select count(*) from job_sheets where client_id = $1) else null end as job_sheet_count
    `,
    [
      clientId,
      visibility.contacts,
      visibility.engagements,
      visibility.quotes,
      visibility.jobSheets,
    ],
  );
  return {
    contacts: parseCount(row?.contact_count),
    engagements: parseCount(row?.engagement_count),
    quotes: parseCount(row?.quote_count),
    jobSheets: parseCount(row?.job_sheet_count),
  };
}

export async function loadClientWorkspaceRead(
  clientId: string,
  requestId: string = crypto.randomUUID(),
  visibility: ClientWorkspaceVisibility = allClientWorkspaceCountsVisible,
): Promise<ClientWorkspaceRead> {
  const [client, counts] = await Promise.all([
    getClient(clientId),
    getClientWorkspaceCounts(clientId, visibility),
  ]);
  const renewalRisk = "renewal_risk" in client ? (client.renewal_risk as RenewalRisk) : null;
  return {
    requestId,
    identity: {
      id: client.id,
      accountId: client.account_id,
      primaryContactId: client.primary_contact_id,
      companyName: client.company_name,
      industry: client.industry,
      tier: client.tier,
      createdAt: client.created_at,
    },
    ownership: { accountOwnerId: client.account_owner },
    relationship: {
      healthScore: client.health_score,
      onboardingStatus: client.onboarding_status,
      renewalDate: client.renewal_date,
      renewalRisk,
      arr: client.arr,
    },
    counts,
  };
}

async function loadSectionData<Section extends ClientWorkspaceSection>(
  clientId: string,
  section: Section,
): Promise<ClientWorkspaceSectionData[Section]> {
  if (section === "contacts") {
    return { contacts: await listClientContacts(clientId) } as ClientWorkspaceSectionData[Section];
  }
  if (section === "activity") {
    const engagements = await listEngagementsByClient(clientId);
    const activityLogs = await listActivityLogsByClientAndEngagementIds(
      clientId,
      engagements.map((engagement) => engagement.id),
    );
    return {
      activityLogs: activityLogs.map(serializeActivityLog),
    } as ClientWorkspaceSectionData[Section];
  }
  if (section === "commercial") {
    return {
      quotes: await listQuotes({ client_id: clientId }),
    } as ClientWorkspaceSectionData[Section];
  }
  if (section === "engagements") {
    return {
      engagements: await listEngagementsByClient(clientId),
    } as ClientWorkspaceSectionData[Section];
  }
  return {
    jobSheets: await listJobSheets({ client_id: clientId }),
  } as ClientWorkspaceSectionData[Section];
}

function isEmptySection(data: ClientWorkspaceSectionData[ClientWorkspaceSection]) {
  return Object.values(data).every((value) => Array.isArray(value) && value.length === 0);
}

export async function loadClientWorkspaceSection<Section extends ClientWorkspaceSection>(
  clientId: string,
  section: Section,
  requestId: string = crypto.randomUUID(),
): Promise<ClientWorkspaceSectionState<ClientWorkspaceSectionData[Section]>> {
  try {
    const data = await loadSectionData(clientId, section);
    return { status: isEmptySection(data) ? "empty" : "ready", data };
  } catch {
    return {
      status: "error",
      error: { code: "query_failed", requestId, retryable: true, section },
    };
  }
}
