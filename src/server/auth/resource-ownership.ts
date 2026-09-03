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
 * Ownership by resource type, batched.
 *
 * Every query takes an id array and returns `(id, owner_profile_id)` pairs, so one round trip
 * answers a whole page. There is deliberately no single-id variant: two SQL strings per type
 * that must agree forever is the shape that hand-copied `REPORT_IDS` into two places and let
 * `SubjectType` drift from its own check constraint. `resolveOwnerProfileId` wraps this
 * instead.
 *
 * On the six joined queries the id comes from the OUTER alias — `q.id`, `p.id`, `c.id`,
 * `cc.id`, `t.id`, `s.id`. Selecting the joined table's id instead would key owners by the
 * wrong record, and both sides are strings, so nothing but the multi-id integration test
 * would notice.
 */
const NEON_OWNERSHIP_QUERIES = {
  account: "select id, account_owner as owner_profile_id from accounts where id = any($1)",
  client: "select id, account_owner as owner_profile_id from clients where id = any($1)",
  lead: "select id, assigned_to as owner_profile_id from leads where id = any($1)",
  campaign: "select id, owner as owner_profile_id from campaigns where id = any($1)",
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

type ScopeRow = { id: string; owner_profile_id: string | null };

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
 * Resolves owners for many ids of one resource type in a single round trip.
 *
 * The returned map is **total**: it carries an entry for every id passed, `null` where the row
 * is absent or the resource is unowned. Those are the same answer — no row means no owner — so
 * a caller never has to distinguish them, and never has to wonder whether a missing key means
 * "unowned" or "I forgot to ask".
 *
 * Throws only when a store errors, exactly as the single-id form does — never a guess, because
 * callers use this to widen a manager's access.
 */
export async function resolveOwnerProfileIds(
  resourceType: string,
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  const owners = new Map<string, string | null>();
  if (ids.length === 0) return owners;

  const unique = [...new Set(ids)];

  if (SUPABASE_OWNED_RESOURCE_TYPES.has(resourceType)) {
    // Sequential, deliberately. This is a correctness placeholder, NOT a batched path: it
    // issues one Supabase read per id. No Supabase-owned type is reachable from any caller
    // that needs batching today, so nothing pays for it — but anyone building a page on this
    // for a Supabase type would get N queries and should add a real batch first.
    for (const id of unique) {
      owners.set(id, await supabaseOwnerProfileId(resourceType, id));
    }
    return owners;
  }

  const sql = NEON_OWNERSHIP_QUERIES[resourceType as NeonOwnedResourceType];
  if (!sql) return owners;

  const rows = await query<ScopeRow>(sql, [unique]);
  for (const id of unique) owners.set(id, null);
  for (const row of rows) owners.set(row.id, row.owner_profile_id);
  return owners;
}

/**
 * Resolves the owning profile for a resource, or null when the resource is unowned, absent,
 * or of a type that carries no ownership at all. Throws only when a store errors — never
 * returns a guess, because the caller uses this to widen a manager's access.
 *
 * A one-element call into `resolveOwnerProfileIds`, so there is one SQL string per resource
 * type rather than two that could disagree.
 */
export async function resolveOwnerProfileId(
  resourceType: string,
  resourceId: string,
): Promise<string | null> {
  const owners = await resolveOwnerProfileIds(resourceType, [resourceId]);
  return owners.get(resourceId) ?? null;
}
