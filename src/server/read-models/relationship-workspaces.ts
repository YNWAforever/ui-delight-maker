import { serializeActivityLog } from "@/lib/serializable";
import type { Lead } from "@/lib/types";
import { getLeadWorkspaceData } from "@/server/repositories/leads";

export type { LeadQuoteSummary } from "@/server/repositories/leads";

/**
 * The lead workspace read is the only member of this module: it reshapes one repository
 * result into a payload the route consumes, so it earns a name of its own.
 *
 * The campaign and relationship-index reads used to live here too, as one-line delegations
 * to `@/server/repositories/campaigns` and `@/server/repositories/relationship-signals`.
 * They were deleted rather than kept for symmetry — a read model that only forwards is a
 * second name for the same behaviour, and a reader asking "what shaping happens on the
 * campaign read path" had to open two files to learn the answer is "none". Callers import
 * those repository functions directly, as 20 of the server functions already did.
 */
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

export type LeadWorkspaceRead = Awaited<ReturnType<typeof loadLeadWorkspaceRead>>;
