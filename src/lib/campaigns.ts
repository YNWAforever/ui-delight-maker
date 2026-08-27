import type { CampaignStatus, CampaignType } from "@/lib/types";

/**
 * The campaign enums as ordered lists, plus the one label map that is *not* a status.
 *
 * `campaigns.type` is a classification, not a lifecycle state, so it stays out of
 * `status-labels.ts` for the same reason lead source does: nothing about a webinar
 * versus a workshop maps onto neutral/info/success/warning/destructive, and giving it a
 * tone would put colour on a word that carries no urgency. Campaign *status* does go
 * through `getStatusLabel("campaigns", …)`.
 *
 * Both arrays exist so a filter, a create form and an edit form offer the same options in
 * the same order. `satisfies` ties them to the union in `src/lib/types.ts`, so adding a
 * value to the type without adding it here is a compile error rather than a dropdown that
 * quietly cannot select the new state.
 */
export const CAMPAIGN_STATUS_VALUES = [
  "draft",
  "planned",
  "active",
  "completed",
  "archived",
] as const satisfies readonly CampaignStatus[];

export const CAMPAIGN_TYPE_VALUES = [
  "client_event",
  "campaign",
  "webinar",
  "workshop",
  "activation",
  "outbound",
] as const satisfies readonly CampaignType[];

const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  client_event: "Client event",
  campaign: "Campaign",
  webinar: "Webinar",
  workshop: "Workshop",
  activation: "Activation",
  outbound: "Outbound",
};

/** Falls back to the stored value with underscores opened up — never "Unknown". */
export function campaignTypeLabel(type: string | null | undefined): string {
  if (!type) return "Campaign";
  const labels: Record<string, string | undefined> = CAMPAIGN_TYPE_LABELS;
  return labels[type] ?? type.replace(/_/g, " ");
}
