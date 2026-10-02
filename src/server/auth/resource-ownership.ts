import { query } from "@/server/db/neon.server";

// Each resource is owned by Neon; batch results are keyed by the outer record ID.
const NEON_OWNERSHIP_QUERIES = {
  account: "select id, account_owner as owner_profile_id from accounts where id = any($1)",
  client: "select id, account_owner as owner_profile_id from clients where id = any($1)",
  lead: "select id, assigned_to as owner_profile_id from leads where id = any($1)",
  campaign: "select id, owner as owner_profile_id from campaigns where id = any($1)",
  campaign_member:
    "select d.id,coalesce(c.owner,d.follow_up_owner,a.account_owner) as owner_profile_id from campaign_members d join campaigns c on c.id=d.campaign_id left join accounts a on a.id=d.account_id where d.id=any($1)",
  task: "select id, assigned_to as owner_profile_id from tasks where id = any($1)",
  engagement: "select id, owner as owner_profile_id from engagements where id = any($1)",
  human_approval:
    "select id, assigned_to as owner_profile_id from human_approvals where id = any($1)",
  quote:
    "select q.id, coalesce(q.created_by, a.account_owner) as owner_profile_id from quotes q left join accounts a on a.id = q.account_id where q.id = any($1)",
  job_sheet:
    "select id, coalesce(sales_owner, accounting_owner) as owner_profile_id from job_sheets where id = any($1)",
  job_sheet_portion:
    "select p.id, coalesce(js.sales_owner, js.accounting_owner) as owner_profile_id from job_sheet_portions p join job_sheets js on js.id = p.job_sheet_id where p.id = any($1)",
  account_contact:
    "select c.id, a.account_owner as owner_profile_id from account_contacts c join accounts a on a.id = c.account_id where c.id = any($1)",
  client_contact:
    "select cc.id, c.account_owner as owner_profile_id from client_contacts cc join clients c on c.id = cc.client_id where cc.id = any($1)",
  touchpoint:
    "select t.id, c.account_owner as owner_profile_id from touchpoints t join clients c on c.id = t.client_id where t.id = any($1)",
  relationship_signal:
    "select s.id, a.account_owner as owner_profile_id from relationship_signals s join accounts a on a.id = s.account_id where s.id = any($1)",
  deal: "select d.id, coalesce((select a.account_owner from accounts a where a.id=d.account_id),d.owner) as owner_profile_id from deals d where d.id=any($1)",
  project:
    "select d.id, coalesce((select a.account_owner from accounts a where a.id=d.account_id),d.owner) as owner_profile_id from projects d where d.id=any($1)",
  customer_success_profile:
    "select d.id, coalesce((select a.account_owner from accounts a where a.id=d.account_id),d.cs_owner) as owner_profile_id from customer_success_profiles d where d.id=any($1)",
  engagement_event:
    "select d.id, coalesce(d.created_by,(select a.account_owner from accounts a where a.id=d.account_id),(select a.account_owner from account_contacts c join accounts a on a.id=c.account_id where c.id=d.contact_id)) as owner_profile_id from engagement_events d where d.id=any($1)",
  contact:
    "select d.id, (select a.account_owner from accounts a where a.id=d.account_id) as owner_profile_id from account_contacts d where d.id=any($1)",
  channel_identity:
    "select d.id, case when d.account_id is not null then (select a.account_owner from accounts a where a.id=d.account_id) else (select a.account_owner from account_contacts c join accounts a on a.id=c.account_id where c.id=d.contact_id) end as owner_profile_id from channel_identities d where d.id=any($1)",
  automation_playbook:
    "select d.id, d.created_by as owner_profile_id from automation_playbooks d where d.id=any($1)",
  automation_run:
    "select d.id, coalesce((select a.account_owner from accounts a where a.id=d.account_id),(select p.created_by from automation_playbooks p where p.id=d.playbook_id)) as owner_profile_id from automation_runs d where d.id=any($1)",
  success_touchpoint:
    "select d.id, (select a.account_owner from accounts a where a.id=d.account_id) as owner_profile_id from success_touchpoints d where d.id=any($1)",
} as const;
export type NeonOwnedResourceType = keyof typeof NEON_OWNERSHIP_QUERIES;
export const NEON_OWNED_RESOURCE_TYPES = Object.keys(
  NEON_OWNERSHIP_QUERIES,
) as NeonOwnedResourceType[];
export function neonOwnershipQuery(resourceType: NeonOwnedResourceType) {
  return NEON_OWNERSHIP_QUERIES[resourceType];
}
export async function resolveOwnerProfileIds(
  resourceType: string,
  resourceIds: readonly string[],
): Promise<Map<string, string | null>> {
  const ids = [...new Set(resourceIds)];
  if (!ids.length || !Object.hasOwn(NEON_OWNERSHIP_QUERIES, resourceType)) return new Map();
  const rows = await query<{ id: string; owner_profile_id: string | null }>(
    NEON_OWNERSHIP_QUERIES[resourceType as NeonOwnedResourceType],
    [ids],
  );
  const owners = new Map<string, string | null>(ids.map((id) => [id, null]));
  for (const row of rows) owners.set(row.id, row.owner_profile_id ?? null);
  return owners;
}
export async function resolveOwnerProfileId(
  resourceType: string,
  resourceId: string,
): Promise<string | null> {
  return (await resolveOwnerProfileIds(resourceType, [resourceId])).get(resourceId) ?? null;
}
