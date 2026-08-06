import { createSupabaseServerClient } from "@/legacy-supabase/server";
import type { Deal, EngagementEvent, Project, Task } from "@/lib/types";
import { pickColumns, supabaseOperationFailed } from "./supabase-writes";

/**
 * Deals, and the workspace read around a single deal.
 *
 * These rows live in the quarantined Supabase project rather than Neon — see "Migration In
 * Progress" in CLAUDE.md. The point of this module is that the fact stops leaking into the BFF
 * layer: `src/server-functions/deals.ts` now holds its capability checks and nothing else, and
 * moving `deals` onto Neon becomes a change to the function bodies here instead of a rewrite of
 * every handler. It is the same seam this repo already put around ownership resolution.
 *
 * The reads are a faithful move of what those handlers did inline, including the parts that look
 * incidental and are not: the workspace read issues its four queries concurrently and only checks
 * their errors afterwards, so all four run even when the first fails.
 *
 * The writes are not quite a move. Both now go through the same `DEAL_WRITE_COLUMNS` allowlist —
 * the update always had one, the insert did not — and failures no longer carry the driver's
 * message to the caller. See `./supabase-writes.ts` for why both changed.
 */

const DEAL_WRITE_COLUMNS = [
  "account_id",
  "contact_id",
  "lead_id",
  "quote_id",
  "source_campaign_id",
  "name",
  "stage",
  "status",
  "probability",
  "value",
  "currency",
  "expected_close_date",
  "owner",
] as const;

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
  if (error) throw supabaseOperationFailed("load deals", error);
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

  if (dealResult.error) throw supabaseOperationFailed("load this deal", dealResult.error);
  if (eventsResult.error) {
    throw supabaseOperationFailed("load this deal's engagement events", eventsResult.error);
  }
  if (projectsResult.error) {
    throw supabaseOperationFailed("load this deal's projects", projectsResult.error);
  }
  if (tasksResult.error) throw supabaseOperationFailed("load this deal's tasks", tasksResult.error);

  return {
    deal: dealResult.data,
    engagementEvents: (eventsResult.data ?? []) as EngagementEvent[],
    projects: (projectsResult.data ?? []) as Project[],
    tasks: (tasksResult.data ?? []) as Task[],
  };
}

export async function createDeal(input: CreateDealInput): Promise<Deal> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("deals")
    .insert(pickColumns(input, DEAL_WRITE_COLUMNS))
    .select()
    .single();
  if (error) throw supabaseOperationFailed("create this deal", error);
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
    .update(pickColumns(updates, DEAL_WRITE_COLUMNS))
    .eq("id", id)
    .select()
    .single();
  if (error) throw supabaseOperationFailed("update this deal", error);
  return data as Deal;
}

/** Open deals, which is the set the weighted forecast is computed over. */
export async function listOpenDeals(filters: ForecastDealFilters = {}): Promise<Deal[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase.from("deals").select("*").eq("status", "open");

  if (filters.owner) query = query.eq("owner", filters.owner);
  if (filters.close_before) query = query.lte("expected_close_date", filters.close_before);

  const { data, error } = await query;
  if (error) throw supabaseOperationFailed("load open deals", error);
  return (data ?? []) as Deal[];
}
