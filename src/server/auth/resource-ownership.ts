import { createSupabaseServerClient } from "@/legacy-supabase/server";
import { query } from "@/server/db/neon.server";

/**
 * Who owns a record, for the manager-scope half of an authorization decision.
 *
 * This exists as its own module because ownership resolution is where the data lives, and it
 * has to reach two stores to find it. Keeping it out of `authorization.server.ts` leaves that
 * file to the decision itself, and puts the choice of store in one table instead of two
 * places that could disagree — which they did: `authorization.server.ts` carried a
 * `SUPABASE_RESOURCE_TYPES` set that short-circuited eight resource types, *and* Neon SQL for
 * those same eight types further down. The Neon branches were unreachable, and they named
 * tables that exist in no migration, so had the set ever stopped short-circuiting they would
 * have failed with 42P01 — the exact class of break the route loader gate was built to catch.
 *
 * Every type below resolves through exactly one store. `resource-ownership.integration.test`
 * executes the Neon half against a schema built from `neon/migrations/`, so a query here that
 * drifts from the schema fails a test rather than an authorization check in production.
 */
type SupabaseOwnedResourceType =
  | "supabase_account"
  | "automation_playbook"
  | "automation_run"
  | "customer_success_profile"
  | "engagement_event"
  | "contact"
  | "channel_identity"
  | "deal"
  | "project";

/**
 * Ownership queries for resources whose tables are in the Neon schema. Each returns at most
 * one row with an `owner_profile_id` column; a null or missing row means unowned, which the
 * policy treats as out of a manager's scope rather than as an error.
 */
const NEON_OWNERSHIP_QUERIES = {
  account: "select account_owner as owner_profile_id from accounts where id = $1",
  client: "select account_owner as owner_profile_id from clients where id = $1",
  lead: "select assigned_to as owner_profile_id from leads where id = $1",
  campaign: "select owner as owner_profile_id from campaigns where id = $1",
  task: "select assigned_to as owner_profile_id from tasks where id = $1",
  engagement: "select owner as owner_profile_id from engagements where id = $1",
  human_approval: "select assigned_to as owner_profile_id from human_approvals where id = $1",
  quote:
    "select coalesce(q.created_by, a.account_owner) as owner_profile_id from quotes q left join accounts a on a.id = q.account_id where q.id = $1",
  job_sheet:
    "select coalesce(sales_owner, accounting_owner) as owner_profile_id from job_sheets where id = $1",
  job_sheet_portion:
    "select coalesce(js.sales_owner, js.accounting_owner) as owner_profile_id from job_sheet_portions p join job_sheets js on js.id = p.job_sheet_id where p.id = $1",
  account_contact:
    "select a.account_owner as owner_profile_id from account_contacts c join accounts a on a.id = c.account_id where c.id = $1",
  client_contact:
    "select c.account_owner as owner_profile_id from client_contacts cc join clients c on c.id = cc.client_id where cc.id = $1",
  touchpoint:
    "select c.account_owner as owner_profile_id from touchpoints t join clients c on c.id = t.client_id where t.id = $1",
  relationship_signal:
    "select a.account_owner as owner_profile_id from relationship_signals s join accounts a on a.id = s.account_id where s.id = $1",
} as const;

export type NeonOwnedResourceType = keyof typeof NEON_OWNERSHIP_QUERIES;

export const NEON_OWNED_RESOURCE_TYPES = Object.keys(
  NEON_OWNERSHIP_QUERIES,
) as NeonOwnedResourceType[];

const SUPABASE_OWNED_RESOURCE_TYPES = new Set<string>([
  /**
   * Accounts as they exist in the *Supabase* project.
   *
   * `account` below resolves against Neon's `accounts`, which is right for every Neon-backed
   * caller. The quarantined Supabase modules hold ids from the other database — the two carry
   * different id spaces for the same entity, which is precisely what the Phase 0 measurement
   * exists to quantify — so resolving one against the other found no row and reported the
   * resource as unowned. That read as "in scope" for a manager while the policy treated an
   * absent owner as no constraint, and as "outside scope" once it stopped doing so. Neither is
   * an answer about the account; this type asks the database that actually holds it.
   */
  "supabase_account",
  "automation_playbook",
  "automation_run",
  "customer_success_profile",
  "engagement_event",
  "contact",
  "channel_identity",
  "deal",
  "project",
] satisfies SupabaseOwnedResourceType[]);

type ScopeRow = { owner_profile_id: string | null };

export function neonOwnershipQuery(resourceType: NeonOwnedResourceType) {
  return NEON_OWNERSHIP_QUERIES[resourceType];
}

/**
 * A Supabase read failed while deciding whether a caller may act. The driver message names
 * tables and columns, and this runs on the authorization path, so it is kept off the thrown
 * error and left on `cause` for logs.
 */
function ownershipLookupFailed(resourceType: string, cause: { message: string }) {
  return new Error(`Could not resolve the owner of this ${resourceType}`, {
    cause: new Error(cause.message),
  });
}

type Supabase = ReturnType<typeof createSupabaseServerClient>;

async function supabaseAccountOwner(supabase: Supabase, accountId: string | null | undefined) {
  if (!accountId) return null;
  const { data, error } = await supabase
    .from("accounts")
    .select("account_owner")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw ownershipLookupFailed("account", error);
  return (data?.account_owner as string | null | undefined) ?? null;
}

async function supabaseOwnerProfileId(
  resourceType: string,
  resourceId: string,
): Promise<string | null> {
  const supabase = createSupabaseServerClient();

  if (resourceType === "supabase_account") {
    return await supabaseAccountOwner(supabase, resourceId);
  }

  if (resourceType === "automation_playbook") {
    const { data, error } = await supabase
      .from("automation_playbooks")
      .select("created_by")
      .eq("id", resourceId)
      .maybeSingle();
    if (error) throw ownershipLookupFailed(resourceType, error);
    return (data?.created_by as string | null | undefined) ?? null;
  }

  if (resourceType === "automation_run") {
    const { data, error } = await supabase
      .from("automation_runs")
      .select("account_id, playbook_id")
      .eq("id", resourceId)
      .maybeSingle();
    if (error) throw ownershipLookupFailed(resourceType, error);
    if (!data) return null;
    const accountOwner = await supabaseAccountOwner(supabase, data.account_id as string | null);
    if (accountOwner) return accountOwner;
    if (!data.playbook_id) return null;
    return await supabaseOwnerProfileId("automation_playbook", data.playbook_id as string);
  }

  if (resourceType === "customer_success_profile") {
    const { data, error } = await supabase
      .from("customer_success_profiles")
      .select("account_id, cs_owner")
      .eq("id", resourceId)
      .maybeSingle();
    if (error) throw ownershipLookupFailed(resourceType, error);
    if (!data) return null;
    return (
      (await supabaseAccountOwner(supabase, data.account_id as string | null)) ??
      (data.cs_owner as string | null | undefined) ??
      null
    );
  }

  if (resourceType === "engagement_event") {
    const { data, error } = await supabase
      .from("engagement_events")
      .select("account_id, created_by")
      .eq("id", resourceId)
      .maybeSingle();
    if (error) throw ownershipLookupFailed(resourceType, error);
    if (!data) return null;
    return (
      (data.created_by as string | null | undefined) ??
      (await supabaseAccountOwner(supabase, data.account_id as string | null))
    );
  }

  if (resourceType === "contact" || resourceType === "channel_identity") {
    const table = resourceType === "contact" ? "contacts" : "channel_identities";
    const select = resourceType === "contact" ? "account_id, owner" : "account_id, contact_id";
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq("id", resourceId)
      .maybeSingle();
    if (error) throw ownershipLookupFailed(resourceType, error);
    if (!data) return null;
    const row = data as {
      account_id?: string | null;
      contact_id?: string | null;
      owner?: string | null;
    };
    if (row.account_id) return await supabaseAccountOwner(supabase, row.account_id);
    if (resourceType === "channel_identity" && row.contact_id) {
      return await supabaseOwnerProfileId("contact", row.contact_id);
    }
    return row.owner ?? null;
  }

  // deal | project
  const { data, error } = await supabase
    .from(resourceType === "deal" ? "deals" : "projects")
    .select("account_id, owner")
    .eq("id", resourceId)
    .maybeSingle();
  if (error) throw ownershipLookupFailed(resourceType, error);
  if (!data) return null;
  return (
    (await supabaseAccountOwner(supabase, data.account_id as string | null)) ??
    (data.owner as string | null | undefined) ??
    null
  );
}

/**
 * Resolves the owning profile for a resource, or null when the resource is unowned, absent,
 * or of a type that carries no ownership at all. Throws only when a store errors — never
 * returns a guess, because the caller uses this to widen a manager's access.
 */
export async function resolveOwnerProfileId(
  resourceType: string,
  resourceId: string,
): Promise<string | null> {
  if (SUPABASE_OWNED_RESOURCE_TYPES.has(resourceType)) {
    return await supabaseOwnerProfileId(resourceType, resourceId);
  }

  const sql = NEON_OWNERSHIP_QUERIES[resourceType as NeonOwnedResourceType];
  if (!sql) return null;

  const rows = await query<ScopeRow>(sql, [resourceId]);
  return rows[0]?.owner_profile_id ?? null;
}
