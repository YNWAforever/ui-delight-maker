import { createSupabaseServerClient } from "@/legacy-supabase/server";
import type { AutomationPlaybook, AutomationRun } from "@/lib/types";
import { pickColumns, supabaseOperationFailed } from "./supabase-writes";

/**
 * Automation playbooks and their runs.
 *
 * These rows live in the quarantined Supabase project rather than Neon — see "Migration In
 * Progress" in CLAUDE.md. Moving the access down here leaves `src/server-functions/
 * automation-playbooks.ts` holding its capability checks and its serialization, and makes
 * migrating these two tables a change to the bodies below.
 *
 * Serialization deliberately stays in the caller. This seam moves data access and nothing else;
 * folding a second refactor into it would make the diff impossible to review as behaviour-
 * preserving, which is the only property that matters here.
 */

const PLAYBOOK_CREATE_COLUMNS = [
  "name",
  "trigger_type",
  "description",
  "status",
  "steps",
  "created_by",
] as const;
const PLAYBOOK_UPDATE_COLUMNS = ["name", "description", "trigger_type", "status", "steps"] as const;
const RUN_CREATE_COLUMNS = [
  "playbook_id",
  "contact_id",
  "account_id",
  "deal_id",
  "project_id",
  "trigger_event_id",
  "status",
  "context_data",
  "started_at",
] as const;
const RUN_UPDATE_COLUMNS = [
  "status",
  "output_data",
  "error_message",
  "started_at",
  "finished_at",
] as const;

export type AutomationPlaybookFilters = {
  status?: string;
  trigger_type?: string;
};

export type CreateAutomationPlaybookInput = Pick<AutomationPlaybook, "name" | "trigger_type"> &
  Partial<Pick<AutomationPlaybook, "description" | "status" | "steps" | "created_by">>;

export type CreateAutomationRunInput = Partial<
  Pick<
    AutomationRun,
    | "playbook_id"
    | "contact_id"
    | "account_id"
    | "deal_id"
    | "project_id"
    | "trigger_event_id"
    | "status"
    | "context_data"
    | "started_at"
  >
>;

export type AutomationPlaybookDetail = {
  playbook: AutomationPlaybook;
  runs: AutomationRun[];
};

export async function listAutomationPlaybooks(
  filters: AutomationPlaybookFilters = {},
): Promise<AutomationPlaybook[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("automation_playbooks")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.trigger_type) query = query.eq("trigger_type", filters.trigger_type);

  const { data, error } = await query;
  if (error) throw supabaseOperationFailed("load automation playbooks", error);
  return (data ?? []) as AutomationPlaybook[];
}

/**
 * A playbook with its most recent runs.
 *
 * Both reads stay in one `Promise.all` with their errors checked afterwards, matching what the
 * handler did: the runs query is issued even when the playbook read fails, and a failure in both
 * reports the playbook's message rather than whichever lost the race.
 */
export async function getAutomationPlaybookDetail(id: string): Promise<AutomationPlaybookDetail> {
  const supabase = createSupabaseServerClient();
  const [playbookResult, runsResult] = await Promise.all([
    supabase.from("automation_playbooks").select("*").eq("id", id).single(),
    supabase
      .from("automation_runs")
      .select("*")
      .eq("playbook_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (playbookResult.error) {
    throw supabaseOperationFailed("load this automation playbook", playbookResult.error);
  }
  if (runsResult.error) {
    throw supabaseOperationFailed("load this playbook's runs", runsResult.error);
  }

  return {
    playbook: playbookResult.data as AutomationPlaybook,
    runs: (runsResult.data ?? []) as AutomationRun[],
  };
}

export async function createAutomationPlaybook(
  input: CreateAutomationPlaybookInput,
): Promise<AutomationPlaybook> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("automation_playbooks")
    .insert(pickColumns(input, PLAYBOOK_CREATE_COLUMNS))
    .select()
    .single();
  if (error) throw supabaseOperationFailed("create this automation playbook", error);
  return data as AutomationPlaybook;
}

/** Updates a playbook through a fixed column list — see the note in `deals.ts`. */
export async function updateAutomationPlaybook(
  id: string,
  updates: Partial<AutomationPlaybook>,
): Promise<AutomationPlaybook> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("automation_playbooks")
    .update(pickColumns(updates, PLAYBOOK_UPDATE_COLUMNS))
    .eq("id", id)
    .select()
    .single();
  if (error) throw supabaseOperationFailed("update this automation playbook", error);
  return data as AutomationPlaybook;
}

export async function createAutomationRun(input: CreateAutomationRunInput): Promise<AutomationRun> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("automation_runs")
    .insert(pickColumns(input, RUN_CREATE_COLUMNS))
    .select()
    .single();
  if (error) throw supabaseOperationFailed("start this automation run", error);
  return data as AutomationRun;
}

export async function updateAutomationRun(
  id: string,
  updates: Partial<AutomationRun>,
): Promise<AutomationRun> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("automation_runs")
    .update(pickColumns(updates, RUN_UPDATE_COLUMNS))
    .eq("id", id)
    .select()
    .single();
  if (error) throw supabaseOperationFailed("update this automation run", error);
  return data as AutomationRun;
}
