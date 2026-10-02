import { requireCapability, type RequestAuthorization } from "./authorization.server";
import type { Capability } from "@/lib/admin/types";

const linkedResources = {
  account_id: "account",
  contact_id: "account_contact",
  primary_contact_id: "account_contact",
  deal_id: "deal",
  project_id: "project",
  lead_id: "lead",
  quote_id: "quote",
  source_campaign_id: "campaign",
  campaign_id: "campaign",
  campaign_member_id: "campaign_member",
  playbook_id: "automation_playbook",
  trigger_event_id: "engagement_event",
} as const;
/** Check every supplied parent; choosing an allowed first parent must not bypass another one. */
export async function authorizeDomainLinks(
  capability: Capability,
  input: object,
  context: RequestAuthorization,
): Promise<void> {
  const values = input as Record<string, unknown>;
  for (const [column, resourceType] of Object.entries(linkedResources)) {
    const id = values[column];
    if (typeof id === "string" && id)
      await requireCapability(capability, { resourceType, resourceId: id }, context);
  }
  for (const column of ["owner", "cs_owner"]) {
    const owner = values[column];
    if (typeof owner === "string" && owner)
      await requireCapability(capability, { ownerProfileId: owner }, context);
  }
}
