import { createSupabaseServerClient } from "@/legacy-supabase/server";
import type { Deal, EngagementEvent, Project, Task } from "@/lib/types";

/**
 * Deals, and the workspace read around a single deal.
 *
 * These rows live in the quarantined Supabase project rather than Neon — see "Migration In
 * Progress" in CLAUDE.md. The point of this module is that the fact stops leaking into the BFF
 * layer: `src/server-functions/deals.ts` now holds its capability checks and nothing else, and
 * moving `deals` onto Neon becomes a change to the function bodies here instead of a rewrite of
 * every handler. It is the same seam this repo already put around ownership resolution.
 *
 * Everything below is a faithful move of what those handlers did inline. That includes the parts
 * that look incidental and are not: the workspace read issues its four queries concurrently and
 * only checks their errors afterwards, so all four run even when the first fails; the update
 * carries an explicit column allowlist rather than spreading the caller's object; and failures
 * surface as `new Error(error.message)`, not a typed error. A seam that changed any of those
 * would be a behaviour change wearing a refactor's clothes.
 */

export type DealFilters = {
  status?: string;
  stage?: string;
  owner?: string;
  account_id?: string;
  contact_id?: string;
  source_campaign_id?: string;
};

export type CreateDealInput = Pick<Deal, "name"> &
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

export type ForecastDealFilters = {
  owner?: string;
  close_before?: string;
};

export type DealWorkspace = {
  deal: Deal | null;
  engagementEvents: EngagementEvent[];
  projects: Project[];
  tasks: Task[];
};

export async function listDeals(filters: DealFilters = {}): Promise<Deal[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase.from("deals").select("*").order("created_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.stage) query = query.eq("stage", filters.stage);
  if (filters.owner) query = query.eq("owner", filters.owner);
  if (filters.account_id) query = query.eq("account_id", filters.account_id);
  if (filters.contact_id) query = query.eq("contact_id", filters.contact_id);
  if (filters.source_campaign_id) {
    query = query.eq("source_campaign_id", filters.source_campaign_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as Deal[];
}

/**
 * The deal plus everything the detail view shows beside it.
 *
 * The four reads stay in one `Promise.all` and their errors stay checked afterwards. Awaiting
 * them in sequence would short-circuit on the first failure — fewer round trips to Supabase, and
 * a different error surfaced for a deal whose events and projects both fail.
 */
export async function getDealWorkspace(id: string): Promise<DealWorkspace> {
  const supabase = createSupabaseServerClient();
  const [dealResult, eventsResult, projectsResult, tasksResult] = await Promise.all([
    supabase.from("deals").select("*").eq("id", id).single(),
    supabase
      .from("engagement_events")
      .select("*")
      .eq("deal_id", id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase.from("projects").select("*").eq("deal_id", id),
    supabase.from("tasks").select("*").eq("deal_id", id),
  ]);

  if (dealResult.error) throw new Error(dealResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);
  if (projectsResult.error) throw new Error(projectsResult.error.message);
  if (tasksResult.error) throw new Error(tasksResult.error.message);

  return {
    deal: dealResult.data,
    engagementEvents: (eventsResult.data ?? []) as EngagementEvent[],
    projects: (projectsResult.data ?? []) as Project[],
    tasks: (tasksResult.data ?? []) as Task[],
  };
}

export async function createDeal(input: CreateDealInput): Promise<Deal> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("deals").insert(input).select().single();
  if (error) throw new Error(error.message);
  return data as Deal;
}

/**
 * Updates a deal, one named column at a time.
 *
 * The allowlist is the mass-assignment guard: `updates` arrives from the client through a
 * `data as { updates: Partial<Deal> }` cast that validates nothing, so spreading it would let a
 * caller write `id`, `created_at`, or any column Supabase happens to expose. Adding a field to
 * `Deal` deliberately does not make it writable here.
 */
export async function updateDeal(id: string, updates: Partial<Deal>): Promise<Deal> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("deals")
    .update({
      ...(updates.account_id !== undefined && { account_id: updates.account_id }),
      ...(updates.contact_id !== undefined && { contact_id: updates.contact_id }),
      ...(updates.lead_id !== undefined && { lead_id: updates.lead_id }),
      ...(updates.quote_id !== undefined && { quote_id: updates.quote_id }),
      ...(updates.source_campaign_id !== undefined && {
        source_campaign_id: updates.source_campaign_id,
      }),
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.stage !== undefined && { stage: updates.stage }),
      ...(updates.status !== undefined && { status: updates.status }),
      ...(updates.probability !== undefined && { probability: updates.probability }),
      ...(updates.value !== undefined && { value: updates.value }),
      ...(updates.currency !== undefined && { currency: updates.currency }),
      ...(updates.expected_close_date !== undefined && {
        expected_close_date: updates.expected_close_date,
      }),
      ...(updates.owner !== undefined && { owner: updates.owner }),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Deal;
}

/** Open deals, which is the set the weighted forecast is computed over. */
export async function listOpenDeals(filters: ForecastDealFilters = {}): Promise<Deal[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase.from("deals").select("*").eq("status", "open");

  if (filters.owner) query = query.eq("owner", filters.owner);
  if (filters.close_before) query = query.lte("expected_close_date", filters.close_before);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Deal[];
}
