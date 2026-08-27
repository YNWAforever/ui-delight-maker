import { createServerFn } from "@tanstack/react-start";
import {
  requireCapability,
  requireCapabilityChecks,
  requireCapabilitySet,
} from "@/server/auth/authorization.server";
import { loadLeadWorkspaceRead } from "@/server/read-models/relationship-workspaces";
import {
  getCampaignWithAttendeeSummary,
  listCampaignAttendeeImportSection,
} from "@/server/repositories/campaigns";
import {
  listRelationshipIndexPage,
  type RelationshipIndexFilters,
} from "@/server/repositories/relationship-signals";

function parseIdInput(data: unknown) {
  const id = data && typeof data === "object" ? (data as { id?: unknown }).id : undefined;
  if (typeof id !== "string" || !id.trim()) throw new Error("ID is required");
  return { id: id.trim() };
}

function parseCampaignSectionInput(data: unknown) {
  const candidate = (data ?? {}) as {
    campaignId?: unknown;
    page?: unknown;
    limit?: unknown;
  };
  if (typeof candidate.campaignId !== "string" || !candidate.campaignId.trim()) {
    throw new Error("Campaign ID is required");
  }
  return {
    campaignId: candidate.campaignId.trim(),
    page: typeof candidate.page === "number" ? candidate.page : undefined,
    limit: typeof candidate.limit === "number" ? candidate.limit : undefined,
  };
}

function parseRelationshipIndexInput(data: unknown): RelationshipIndexFilters {
  const candidate = (data ?? {}) as Record<string, unknown>;
  const severity = candidate.severity;
  if (severity !== undefined && !["low", "medium", "high"].includes(String(severity))) {
    throw new Error("Invalid relationship signal severity");
  }
  return {
    page: typeof candidate.page === "number" ? candidate.page : undefined,
    limit: typeof candidate.limit === "number" ? candidate.limit : undefined,
    severity: severity as RelationshipIndexFilters["severity"],
    signalType: typeof candidate.signalType === "string" ? candidate.signalType.trim() : undefined,
  };
}

export const getLeadWorkspaceRead = createServerFn({ method: "GET" })
  .validator(parseIdInput)
  .handler(async ({ data }) => {
    await requireCapabilityChecks([
      {
        capability: "leads.view",
        target: { resourceType: "lead", resourceId: data.id },
      },
      { capability: "quotes.view" },
    ]);
    return loadLeadWorkspaceRead(data.id);
  });

export const getCampaignWorkspaceRead = createServerFn({ method: "GET" })
  .validator(parseIdInput)
  .handler(async ({ data }) => {
    await requireCapability("campaigns.view", {
      resourceType: "campaign",
      resourceId: data.id,
    });
    return getCampaignWithAttendeeSummary(data.id);
  });

export const getCampaignWorkspaceSection = createServerFn({ method: "GET" })
  .validator(parseCampaignSectionInput)
  .handler(async ({ data }) => {
    await requireCapability("campaigns.view", {
      resourceType: "campaign",
      resourceId: data.campaignId,
    });
    return listCampaignAttendeeImportSection(data.campaignId, data);
  });

/**
 * The relationship index, plus whether this caller may act on what it returns.
 *
 * The required pair is unchanged — `accounts.view` and `engagements.view`, both still
 * mandatory — so nothing here is weakened. What is added is a *probe*:
 * `engagements.update` is asked as an optional capability, which never throws, and its
 * answer travels back as `canDismissSignals`.
 *
 * That exists because the page loads on a strictly weaker capability set than its only
 * write needs. Without the probe a view-only user saw a fully enabled Dismiss button and
 * learned it was a permissions refusal only from a generic failure toast.
 *
 * The probe is deliberately untargeted, and the asymmetry matters:
 * `dismissRelationshipSignalFn` re-checks `engagements.update` **against the individual
 * signal**, so `false` here means the write is certain to be refused and the control can
 * be hidden, while `true` means only that the role grants it — a manager can still be
 * out of scope for one particular signal. So this value is used to remove a control that
 * cannot work, never to skip a check or to promise a write will succeed.
 */
export const getRelationshipIndexRead = createServerFn({ method: "GET" })
  .validator(parseRelationshipIndexInput)
  .handler(async ({ data }) => {
    const access = await requireCapabilitySet(["accounts.view", "engagements.view"], {
      optional: ["engagements.update"],
    });
    const page = await listRelationshipIndexPage(data);
    return { ...page, canDismissSignals: access["engagements.update"] === true };
  });
