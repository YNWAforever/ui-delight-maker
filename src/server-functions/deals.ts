import { requireCapability } from "@/server/auth/authorization.server";
// src/server-functions/deals.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/legacy-supabase/server";
import { calculateWeightedForecast } from "@/lib/lifecycle-utils";
import type { Deal } from "@/lib/types";

type GetDealsInput = {
  status?: string;
  stage?: string;
  owner?: string;
  account_id?: string;
  contact_id?: string;
  source_campaign_id?: string;
};

type CreateDealInput = Pick<Deal, "name"> &
  Partial<
    Pick<
      Deal,
      | "account_id"
      | "contact_id"
      | "lead_id"
      | "quote_id"
      | "source_campaign_id"
      | "stage"
      | "status"
      | "probability"
      | "value"
      | "currency"
      | "expected_close_date"
      | "owner"
    >
  >;

export const getDeals = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetDealsInput)
  .handler(async ({ data }) => {
    await requireCapability("accounts.view");
    const supabase = createSupabaseServerClient();
    let query = supabase.from("deals").select("*").order("created_at", { ascending: false });

    if (data.status) query = query.eq("status", data.status);
    if (data.stage) query = query.eq("stage", data.stage);
    if (data.owner) query = query.eq("owner", data.owner);
    if (data.account_id) query = query.eq("account_id", data.account_id);
    if (data.contact_id) query = query.eq("contact_id", data.contact_id);
    if (data.source_campaign_id) query = query.eq("source_campaign_id", data.source_campaign_id);

    const { data: deals, error } = await query;
    if (error) throw new Error(error.message);
    return deals as Deal[];
  });

export const getDeal = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireCapability("accounts.view", { resourceType: "deal", resourceId: data.id });
    const supabase = createSupabaseServerClient();
    const [dealResult, eventsResult, projectsResult, tasksResult] = await Promise.all([
      supabase.from("deals").select("*").eq("id", data.id).single(),
      supabase
        .from("engagement_events")
        .select("*")
        .eq("deal_id", data.id)
        .order("occurred_at", { ascending: false })
        .limit(50),
      supabase.from("projects").select("*").eq("deal_id", data.id),
      supabase.from("tasks").select("*").eq("deal_id", data.id),
    ]);

    if (dealResult.error) throw new Error(dealResult.error.message);
    if (eventsResult.error) throw new Error(eventsResult.error.message);
    if (projectsResult.error) throw new Error(projectsResult.error.message);
    if (tasksResult.error) throw new Error(tasksResult.error.message);

    return {
      deal: dealResult.data,
      engagementEvents: eventsResult.data ?? [],
      projects: projectsResult.data ?? [],
      tasks: tasksResult.data ?? [],
    };
  });

export const createDeal = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateDealInput)
  .handler(async ({ data }) => {
    await requireCapability("accounts.create");
    const supabase = createSupabaseServerClient();
    const { data: deal, error } = await supabase.from("deals").insert(data).select().single();
    if (error) throw new Error(error.message);
    return deal as Deal;
  });

export const updateDeal = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Deal> })
  .handler(async ({ data }) => {
    await requireCapability("accounts.update", { resourceType: "deal", resourceId: data.id });
    const supabase = createSupabaseServerClient();
    const { data: deal, error } = await supabase
      .from("deals")
      .update({
        ...(data.updates.account_id !== undefined && { account_id: data.updates.account_id }),
        ...(data.updates.contact_id !== undefined && { contact_id: data.updates.contact_id }),
        ...(data.updates.lead_id !== undefined && { lead_id: data.updates.lead_id }),
        ...(data.updates.quote_id !== undefined && { quote_id: data.updates.quote_id }),
        ...(data.updates.source_campaign_id !== undefined && {
          source_campaign_id: data.updates.source_campaign_id,
        }),
        ...(data.updates.name !== undefined && { name: data.updates.name }),
        ...(data.updates.stage !== undefined && { stage: data.updates.stage }),
        ...(data.updates.status !== undefined && { status: data.updates.status }),
        ...(data.updates.probability !== undefined && { probability: data.updates.probability }),
        ...(data.updates.value !== undefined && { value: data.updates.value }),
        ...(data.updates.currency !== undefined && { currency: data.updates.currency }),
        ...(data.updates.expected_close_date !== undefined && {
          expected_close_date: data.updates.expected_close_date,
        }),
        ...(data.updates.owner !== undefined && { owner: data.updates.owner }),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return deal as Deal;
  });

export const getForecast = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as { owner?: string; close_before?: string })
  .handler(async ({ data }) => {
    await requireCapability("accounts.view");
    const supabase = createSupabaseServerClient();
    let query = supabase.from("deals").select("*").eq("status", "open");

    if (data.owner) query = query.eq("owner", data.owner);
    if (data.close_before) query = query.lte("expected_close_date", data.close_before);

    const { data: deals, error } = await query;
    if (error) throw new Error(error.message);

    return calculateWeightedForecast((deals ?? []) as Deal[]);
  });
