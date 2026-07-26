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

export const getRelationshipIndexRead = createServerFn({ method: "GET" })
  .validator(parseRelationshipIndexInput)
  .handler(async ({ data }) => {
    await requireCapabilitySet(["accounts.view", "engagements.view"]);
    return listRelationshipIndexPage(data);
  });
