import { createSupabaseServerClient } from "@/legacy-supabase/server";
import type { CustomerSuccessProfile, Project, SuccessTouchpoint, Task } from "@/lib/types";
import { pickColumns, supabaseOperationFailed } from "./supabase-writes";

/**
 * Customer-success profiles and the touchpoints against them.
 *
 * Supabase-backed for now — see "Migration In Progress" in CLAUDE.md and the note at the top of
 * `./deals.ts`, which this follows. Named for the domain rather than the table because
 * `./touchpoints.ts` already exists and is the Neon `touchpoints` table, a different thing.
 *
 * Two inherited behaviours survive deliberately:
 *
 * - `listCustomerSuccessProfiles` casts without `?? []`; the dashboard read coalesces.
 * - Stamping `last_touch_at` after a touchpoint is written does not check its error, so a failed
 *   stamp leaves the touchpoint recorded and the profile stale, silently.
 *
 * The upsert used to spread the caller's object where the update wrote a column list; both go
 * through an allowlist now. See `./supabase-writes.ts`.
 */

const PROFILE_UPSERT_COLUMNS = [
  "account_id",
  "primary_contact_id",
  "project_id",
  "cs_owner",
  "health_score",
  "onboarding_status",
  "renewal_date",
  "renewal_risk",
  "next_best_action",
  "expansion_signal",
  "last_touch_at",
] as const;
const PROFILE_UPDATE_COLUMNS = [
  "primary_contact_id",
  "project_id",
  "cs_owner",
  "health_score",
  "onboarding_status",
  "renewal_date",
  "renewal_risk",
  "next_best_action",
  "expansion_signal",
  "last_touch_at",
] as const;
const TOUCHPOINT_CREATE_COLUMNS = [
  "account_id",
  "contact_id",
  "project_id",
  "touchpoint_type",
  "sentiment",
  "notes",
  "occurred_at",
  "created_by",
] as const;

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
  if (error) throw supabaseOperationFailed("load customer success profiles", error);
  return data as CustomerSuccessProfile[];
}

/** Every profile, renewal-soonest first, for the dashboard's aggregates. */
export async function listCustomerSuccessProfilesForDashboard(): Promise<CustomerSuccessProfile[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_success_profiles")
    .select("*")
    .order("renewal_date", { ascending: true });
  if (error) throw supabaseOperationFailed("load the customer success dashboard", error);
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

  if (profileResult.error) {
    throw supabaseOperationFailed("load this account's success profile", profileResult.error);
  }
  if (touchpointsResult.error) {
    throw supabaseOperationFailed("load this account's touchpoints", touchpointsResult.error);
  }
  if (projectsResult.error) {
    throw supabaseOperationFailed("load this account's projects", projectsResult.error);
  }
  if (tasksResult.error) {
    throw supabaseOperationFailed("load this account's tasks", tasksResult.error);
  }

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
 * `account_id` is in the allowlist here and not in the update's, because it is the conflict
 * target: an upsert has to carry it to know which row it is replacing, and an update must not be
 * able to move a profile to a different account.
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
    .upsert(pickColumns(input, PROFILE_UPSERT_COLUMNS), { onConflict: "account_id" })
    .select()
    .single();
  if (error) throw supabaseOperationFailed("save this customer success profile", error);
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
  if (error) throw supabaseOperationFailed("load this profile's renewal inputs", error);
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
      ...pickColumns(updates, PROFILE_UPDATE_COLUMNS),
      // Last, so a recomputed risk still beats an explicit one sent alongside a health change.
      ...(riskOverride && riskOverride),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw supabaseOperationFailed("update this customer success profile", error);
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
    .insert(pickColumns(input, TOUCHPOINT_CREATE_COLUMNS))
    .select()
    .single();
  if (error) throw supabaseOperationFailed("record this touchpoint", error);

  await supabase
    .from("customer_success_profiles")
    .update({ last_touch_at: touchpoint.occurred_at })
    .eq("account_id", input.account_id);

  return touchpoint as SuccessTouchpoint;
}
