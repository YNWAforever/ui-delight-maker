// src/server-functions/customer-success.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/legacy-supabase/server";
import { assessRenewalRisk } from "@/lib/lifecycle-utils";
import type { CustomerSuccessProfile, SuccessTouchpoint } from "@/lib/types";

type GetCustomerSuccessProfilesInput = {
  cs_owner?: string;
  renewal_risk?: string;
  onboarding_status?: string;
  renewal_before?: string;
};

type UpsertCustomerSuccessProfileInput = Pick<CustomerSuccessProfile, "account_id"> &
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

type CreateSuccessTouchpointInput = Pick<SuccessTouchpoint, "account_id"> &
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

export const getCustomerSuccessProfiles = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetCustomerSuccessProfilesInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase
      .from("customer_success_profiles")
      .select("*")
      .order("renewal_date", { ascending: true });

    if (data.cs_owner) query = query.eq("cs_owner", data.cs_owner);
    if (data.renewal_risk) query = query.eq("renewal_risk", data.renewal_risk);
    if (data.onboarding_status) query = query.eq("onboarding_status", data.onboarding_status);
    if (data.renewal_before) query = query.lte("renewal_date", data.renewal_before);

    const { data: profiles, error } = await query;
    if (error) throw new Error(error.message);
    return profiles as CustomerSuccessProfile[];
  });

export const getCustomerSuccessProfile = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { accountId: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const [profileResult, touchpointsResult, projectsResult, tasksResult] = await Promise.all([
      supabase
        .from("customer_success_profiles")
        .select("*")
        .eq("account_id", data.accountId)
        .maybeSingle(),
      supabase
        .from("success_touchpoints")
        .select("*")
        .eq("account_id", data.accountId)
        .order("occurred_at", { ascending: false })
        .limit(50),
      supabase
        .from("projects")
        .select("*")
        .eq("account_id", data.accountId)
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("*")
        .eq("account_id", data.accountId)
        .order("created_at", { ascending: false }),
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);
    if (touchpointsResult.error) throw new Error(touchpointsResult.error.message);
    if (projectsResult.error) throw new Error(projectsResult.error.message);
    if (tasksResult.error) throw new Error(tasksResult.error.message);

    return {
      profile: profileResult.data as CustomerSuccessProfile | null,
      touchpoints: (touchpointsResult.data ?? []) as SuccessTouchpoint[],
      projects: projectsResult.data ?? [],
      tasks: tasksResult.data ?? [],
    };
  });

export const upsertCustomerSuccessProfile = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as UpsertCustomerSuccessProfileInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const risk = assessRenewalRisk({
      health_score: data.health_score ?? null,
      renewal_date: data.renewal_date ?? null,
    });

    const { data: profile, error } = await supabase
      .from("customer_success_profiles")
      .upsert(
        {
          ...data,
          renewal_risk: data.renewal_risk ?? risk.level,
          next_best_action: data.next_best_action ?? risk.nextBestAction,
        },
        { onConflict: "account_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return profile as CustomerSuccessProfile;
  });

export const updateCustomerSuccessProfile = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as { id: string; updates: Partial<Omit<CustomerSuccessProfile, "id" | "account_id">> },
  )
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let risk: ReturnType<typeof assessRenewalRisk> | null = null;
    if (data.updates.health_score !== undefined || data.updates.renewal_date !== undefined) {
      const { data: current, error: currentError } = await supabase
        .from("customer_success_profiles")
        .select("health_score, renewal_date")
        .eq("id", data.id)
        .single();
      if (currentError) throw new Error(currentError.message);

      risk = assessRenewalRisk({
        health_score: data.updates.health_score ?? current.health_score,
        renewal_date: data.updates.renewal_date ?? current.renewal_date,
      });
    }

    const { data: profile, error } = await supabase
      .from("customer_success_profiles")
      .update({
        ...(data.updates.primary_contact_id !== undefined && {
          primary_contact_id: data.updates.primary_contact_id,
        }),
        ...(data.updates.project_id !== undefined && { project_id: data.updates.project_id }),
        ...(data.updates.cs_owner !== undefined && { cs_owner: data.updates.cs_owner }),
        ...(data.updates.health_score !== undefined && { health_score: data.updates.health_score }),
        ...(data.updates.onboarding_status !== undefined && {
          onboarding_status: data.updates.onboarding_status,
        }),
        ...(data.updates.renewal_date !== undefined && { renewal_date: data.updates.renewal_date }),
        ...(data.updates.renewal_risk !== undefined && {
          renewal_risk: data.updates.renewal_risk,
        }),
        ...(data.updates.next_best_action !== undefined && {
          next_best_action: data.updates.next_best_action,
        }),
        ...(data.updates.expansion_signal !== undefined && {
          expansion_signal: data.updates.expansion_signal,
        }),
        ...(data.updates.last_touch_at !== undefined && {
          last_touch_at: data.updates.last_touch_at,
        }),
        ...(risk && { renewal_risk: risk.level, next_best_action: risk.nextBestAction }),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return profile as CustomerSuccessProfile;
  });

export const createSuccessTouchpoint = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateSuccessTouchpointInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: touchpoint, error } = await supabase
      .from("success_touchpoints")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase
      .from("customer_success_profiles")
      .update({ last_touch_at: touchpoint.occurred_at })
      .eq("account_id", data.account_id);

    return touchpoint as SuccessTouchpoint;
  });

export const getCustomerSuccessDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createSupabaseServerClient();
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: profiles, error } = await supabase
    .from("customer_success_profiles")
    .select("*")
    .order("renewal_date", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (profiles ?? []) as CustomerSuccessProfile[];
  const healthTotal = rows.reduce((sum, profile) => sum + profile.health_score, 0);

  return {
    accounts: rows,
    averageAccountHealth: rows.length > 0 ? Math.round(healthTotal / rows.length) : 0,
    highRiskAccounts: rows.filter((profile) => profile.renewal_risk === "high").length,
    renewalsDue30: rows.filter(
      (profile) => profile.renewal_date !== null && profile.renewal_date <= in30Days,
    ).length,
  };
});
