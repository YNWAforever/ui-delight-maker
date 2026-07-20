import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { requireCapability, requireCapabilitySet } from "@/server/auth/authorization.server";
import {
  loadCampaignWorkspaceRead,
  loadCampaignWorkspaceSection,
  loadLeadWorkspaceRead,
  loadRelationshipIndexRead,
  type RelationshipIndexFilters,
} from "@/server/read-models/relationship-workspaces";

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
    await requireCapability("leads.view", {
      resourceType: "lead",
      resourceId: data.id,
    });
    await requireCapability("quotes.view");
    await requireNeonAuthSession();
    return loadLeadWorkspaceRead(data.id);
  });

export const getCampaignWorkspaceRead = createServerFn({ method: "GET" })
  .validator(parseIdInput)
  .handler(async ({ data }) => {
    await requireCapability("campaigns.view", {
      resourceType: "campaign",
      resourceId: data.id,
    });
    await requireNeonAuthSession();
    return loadCampaignWorkspaceRead(data.id);
  });

export const getCampaignWorkspaceSection = createServerFn({ method: "GET" })
  .validator(parseCampaignSectionInput)
  .handler(async ({ data }) => {
    await requireCapability("campaigns.view", {
      resourceType: "campaign",
      resourceId: data.campaignId,
    });
    await requireNeonAuthSession();
    return loadCampaignWorkspaceSection(data.campaignId, data);
  });

export const getRelationshipIndexRead = createServerFn({ method: "GET" })
  .validator(parseRelationshipIndexInput)
  .handler(async ({ data }) => {
    await requireCapabilitySet(["accounts.view", "engagements.view"]);
    await requireNeonAuthSession();
    return loadRelationshipIndexRead(data);
  });
