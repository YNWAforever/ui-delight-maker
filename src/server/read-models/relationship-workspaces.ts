import type { Lead } from "@/lib/types";
import {
  getCampaignWithAttendeeSummary,
  listCampaignAttendeeImportSection,
  type CampaignAttendeePageFilters,
} from "@/server/repositories/campaigns";
import { getLeadWorkspaceData } from "@/server/repositories/leads";
import {
  listRelationshipIndexPage,
  type RelationshipIndexFilters,
} from "@/server/repositories/relationship-signals";
import { serializeActivityLog } from "@/server-functions/serializers";

export type {
  CampaignAttendeeRow,
  CampaignAttendeeSummary,
  CampaignImportHistoryEntry,
} from "@/server/repositories/campaigns";
export type { LeadQuoteSummary } from "@/server/repositories/leads";
export type {
  RelationshipIndexFilters,
  RelationshipSignalSummary,
} from "@/server/repositories/relationship-signals";

export async function loadLeadWorkspaceRead(id: string) {
  const data = await getLeadWorkspaceData(id);
  return {
    lead: data.lead,
    qualification: {
      status: data.lead.status,
      score: data.lead.lead_score,
      data: data.lead.qualification_data,
    } satisfies {
      status: Lead["status"];
      score: number;
      data: Lead["qualification_data"];
    },
    activityLogs: data.activityLogs.map(serializeActivityLog),
    quotes: data.quotes,
  };
}

export function loadCampaignWorkspaceRead(id: string) {
  return getCampaignWithAttendeeSummary(id);
}

export function loadCampaignWorkspaceSection(
  campaignId: string,
  filters: CampaignAttendeePageFilters = {},
) {
  return listCampaignAttendeeImportSection(campaignId, filters);
}

export function loadRelationshipIndexRead(filters: RelationshipIndexFilters = {}) {
  return listRelationshipIndexPage(filters);
}

export type LeadWorkspaceRead = Awaited<ReturnType<typeof loadLeadWorkspaceRead>>;
export type CampaignWorkspaceRead = Awaited<ReturnType<typeof loadCampaignWorkspaceRead>>;
export type CampaignWorkspaceSectionRead = Awaited<ReturnType<typeof loadCampaignWorkspaceSection>>;
export type RelationshipIndexRead = Awaited<ReturnType<typeof loadRelationshipIndexRead>>;
