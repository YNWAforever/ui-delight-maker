import { createSupabaseServerClient } from "@/legacy-supabase/server";
import type { CustomerSuccessProfile, Project, SuccessTouchpoint, Task } from "@/lib/types";

/**
 * Customer-success profiles and the touchpoints against them.
 *
 * Supabase-backed for now — see "Migration In Progress" in CLAUDE.md and the note at the top of
 * `./deals.ts`, which this follows. Named for the domain rather than the table because
 * `./touchpoints.ts` already exists and is the Neon `touchpoints` table, a different thing.
 *
 * Three inherited behaviours survive the move deliberately:
 *
 * - The upsert spreads the caller's object while the update writes a fixed column list. The two
 *   are not consistent and are not made consistent here.
 * - `listCustomerSuccessProfiles` casts without `?? []`; the dashboard read coalesces. Both
 *   preserved.
 * - Stamping `last_touch_at` after a touchpoint is written does not check its error, so a failed
 *   stamp leaves the touchpoint recorded and the profile stale, silently.
 */

export type CustomerSuccessProfileFilters = {
  cs_owner?: string;
  renewal_risk?: string;
  onboarding_status?: string;
  renewal_before?: string;
};

export type UpsertCustomerSuccessProfileInput = Pick<CustomerSuccessProfile, "account_id"> &
  Partial<
    Pick<
      CustomerSuccessProfile,
      | "primary_contact_id"
      | "project_id"
      | "cs_owner"
      | "health_score"
      | "onboarding_status"
      | "renewal_date"
      | "renewal_risk"
      | "next_best_action"
      | "expansion_signal"
      | "last_touch_at"
    >
  >;

export type CreateSuccessTouchpointInput = Pick<SuccessTouchpoint, "account_id"> &
  Partial<
    Pick<
      SuccessTouchpoint,
      | "contact_id"
      | "project_id"
      | "touchpoint_type"
      | "sentiment"
      | "notes"
      | "occurred_at"
      | "created_by"
    >
  >;

export type CustomerSuccessAccountWorkspace = {
  profile: CustomerSuccessProfile | null;
  touchpoints: SuccessTouchpoint[];
  projects: Project[];
  tasks: Task[];
};

/** What the risk assessment needs about a profile as it stands today. */
export type CustomerSuccessRiskInputs = Pick<
  CustomerSuccessProfile,
  "health_score" | "renewal_date"
>;

/** The two fields a recomputed risk overwrites, or null when no risk was recomputed. */
export type RenewalRiskOverride = Pick<
  CustomerSuccessProfile,
  "renewal_risk" | "next_best_action"
> | null;

export async function listCustomerSuccessProfiles(
  filters: CustomerSuccessProfileFilters = {},
): Promise<CustomerSuccessProfile[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("customer_success_profiles")
    .select("*")
    .order("renewal_date", { ascending: true });

  if (filters.cs_owner) query = query.eq("cs_owner", filters.cs_owner);
  if (filters.renewal_risk) query = query.eq("renewal_risk", filters.renewal_risk);
  if (filters.onboarding_status) query = query.eq("onboarding_status", filters.onboarding_status);
  // The input is named `renewal_before`; the column is `renewal_date`.
  if (filters.renewal_before) query = query.lte("renewal_date", filters.renewal_before);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as CustomerSuccessProfile[];
}

/** Every profile, renewal-soonest first, for the dashboard's aggregates. */
export async function listCustomerSuccessProfilesForDashboard(): Promise<CustomerSuccessProfile[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_success_profiles")
    .select("*")
    .order("renewal_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerSuccessProfile[];
}

/**
 * An account's customer-success picture.
 *
 * One `Promise.all`, errors checked afterwards in the order profile -> touchpoints -> projects ->
 * tasks. The profile uses `maybeSingle()`, so an account with no profile is `null` rather than an
 * error — the caller distinguishes those.
 */
export async function getCustomerSuccessAccountWorkspace(
  accountId: string,
): Promise<CustomerSuccessAccountWorkspace> {
  const supabase = createSupabaseServerClient();
  const [profileResult, touchpointsResult, projectsResult, tasksResult] = await Promise.all([
    supabase
      .from("customer_success_profiles")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle(),
    supabase
      .from("success_touchpoints")
      .select("*")
      .eq("account_id", accountId)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase
      .from("projects")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false }),
  ]);

  if (profileResult.error) throw new Error(profileResult.error.message);
  if (touchpointsResult.error) throw new Error(touchpointsResult.error.message);
  if (projectsResult.error) throw new Error(projectsResult.error.message);
  if (tasksResult.error) throw new Error(tasksResult.error.message);

  return {
    profile: profileResult.data as CustomerSuccessProfile | null,
    touchpoints: (touchpointsResult.data ?? []) as SuccessTouchpoint[],
    projects: (projectsResult.data ?? []) as Project[],
    tasks: (tasksResult.data ?? []) as Task[],
  };
}

/**
 * Creates or replaces an account's profile.
 *
 * Unlike {@link updateCustomerSuccessProfile} this spreads the caller's object rather than
 * writing a column list, so any key the unvalidated input carries reaches PostgREST. Inherited,
 * and left alone: a seam is the wrong place to change what a write is allowed to touch.
 */
export async function upsertCustomerSuccessProfile(
  input: UpsertCustomerSuccessProfileInput & {
    renewal_risk: CustomerSuccessProfile["renewal_risk"];
    next_best_action: CustomerSuccessProfile["next_best_action"];
  },
): Promise<CustomerSuccessProfile> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_success_profiles")
    .upsert(input, { onConflict: "account_id" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CustomerSuccessProfile;
}

/**
 * The stored health score and renewal date, read only when one of them is being changed.
 *
 * `single()`, so a profile that does not exist is an error — the update that follows would fail
 * anyway, and failing here keeps the message about the profile rather than the patch.
 */
export async function getCustomerSuccessRiskInputs(id: string): Promise<CustomerSuccessRiskInputs> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_success_profiles")
    .select("health_score, renewal_date")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as CustomerSuccessRiskInputs;
}

/**
 * Updates a profile through a fixed column list, with any recomputed risk applied last.
 *
 * "Last" is load-bearing: when the caller sends an explicit `renewal_risk` *and* changes the
 * health score, the recomputed value wins, because its spread comes after. Moving the override
 * earlier would silently flip which one takes effect.
 */
export async function updateCustomerSuccessProfile(
  id: string,
  updates: Partial<Omit<CustomerSuccessProfile, "id" | "account_id">>,
  riskOverride: RenewalRiskOverride = null,
): Promise<CustomerSuccessProfile> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_success_profiles")
    .update({
      ...(updates.primary_contact_id !== undefined && {
        primary_contact_id: updates.primary_contact_id,
      }),
      ...(updates.project_id !== undefined && { project_id: updates.project_id }),
      ...(updates.cs_owner !== undefined && { cs_owner: updates.cs_owner }),
      ...(updates.health_score !== undefined && { health_score: updates.health_score }),
      ...(updates.onboarding_status !== undefined && {
        onboarding_status: updates.onboarding_status,
      }),
      ...(updates.renewal_date !== undefined && { renewal_date: updates.renewal_date }),
      ...(updates.renewal_risk !== undefined && { renewal_risk: updates.renewal_risk }),
      ...(updates.next_best_action !== undefined && {
        next_best_action: updates.next_best_action,
      }),
      ...(updates.expansion_signal !== undefined && {
        expansion_signal: updates.expansion_signal,
      }),
      ...(updates.last_touch_at !== undefined && { last_touch_at: updates.last_touch_at }),
      ...(riskOverride && riskOverride),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CustomerSuccessProfile;
}

/**
 * Records a touchpoint and stamps the account's `last_touch_at` from it.
 *
 * The stamp's error is never inspected, so a profile that does not exist yet — or a permission
 * failure on that table — leaves the touchpoint recorded and the profile untouched, with nothing
 * surfaced. Existing contract; the touchpoint comes back either way.
 */
export async function createSuccessTouchpoint(
  input: CreateSuccessTouchpointInput,
): Promise<SuccessTouchpoint> {
  const supabase = createSupabaseServerClient();
  const { data: touchpoint, error } = await supabase
    .from("success_touchpoints")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase
    .from("customer_success_profiles")
    .update({ last_touch_at: touchpoint.occurred_at })
    .eq("account_id", input.account_id);

  return touchpoint as SuccessTouchpoint;
}
