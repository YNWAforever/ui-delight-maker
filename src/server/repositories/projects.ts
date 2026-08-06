import { createSupabaseServerClient } from "@/legacy-supabase/server";
import type { CustomerSuccessProfile, Deal, EngagementEvent, Project, Task } from "@/lib/types";
import { pickColumns, supabaseOperationFailed } from "./supabase-writes";

/**
 * Projects, and the workspace read around a single project.
 *
 * Supabase-backed for now — see "Migration In Progress" in CLAUDE.md and the note at the top of
 * `./deals.ts`, which this follows. Data access only: the "is this deal won" rule stays in the
 * caller, because it is a decision about the data rather than a way of fetching it.
 *
 * `listProjects` casts without `?? []` while the workspace read coalesces its arrays — inherited,
 * and preserved rather than tidied. Both writes share `PROJECT_WRITE_COLUMNS`; the insert used to
 * pass the caller's object through untouched. See `./supabase-writes.ts`.
 */

const PROJECT_WRITE_COLUMNS = [
  "account_id",
  "contact_id",
  "deal_id",
  "quote_id",
  "name",
  "status",
  "start_date",
  "target_end_date",
  "owner",
  "value",
  "currency",
] as const;

export type ProjectFilters = {
  status?: string;
  owner?: string;
  account_id?: string;
  contact_id?: string;
  deal_id?: string;
};

export type CreateProjectInput = Pick<Project, "name"> &
  Partial<
    Pick<
      Project,
      | "account_id"
      | "contact_id"
      | "deal_id"
      | "quote_id"
      | "status"
      | "start_date"
      | "target_end_date"
      | "owner"
      | "value"
      | "currency"
    >
  >;

export type ProjectWorkspace = {
  project: Project;
  engagementEvents: EngagementEvent[];
  tasks: Task[];
  customerSuccessProfile: CustomerSuccessProfile | null;
};

export async function listProjects(filters: ProjectFilters = {}): Promise<Project[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase.from("projects").select("*").order("created_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.owner) query = query.eq("owner", filters.owner);
  if (filters.account_id) query = query.eq("account_id", filters.account_id);
  if (filters.contact_id) query = query.eq("contact_id", filters.contact_id);
  if (filters.deal_id) query = query.eq("deal_id", filters.deal_id);

  const { data, error } = await query;
  if (error) throw supabaseOperationFailed("load projects", error);
  return data as Project[];
}

/**
 * A project with its events, tasks and customer-success profile.
 *
 * One `Promise.all`, errors checked afterwards in the order project -> events -> tasks -> profile.
 * The profile read uses `maybeSingle()`, so a project with no profile is `null` rather than an
 * error; the project itself uses `single()`, so a missing project *is* one.
 */
export async function getProjectWorkspace(id: string): Promise<ProjectWorkspace> {
  const supabase = createSupabaseServerClient();
  const [projectResult, eventsResult, tasksResult, csResult] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase
      .from("engagement_events")
      .select("*")
      .eq("project_id", id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase.from("tasks").select("*").eq("project_id", id),
    supabase.from("customer_success_profiles").select("*").eq("project_id", id).maybeSingle(),
  ]);

  if (projectResult.error) throw supabaseOperationFailed("load this project", projectResult.error);
  if (eventsResult.error) {
    throw supabaseOperationFailed("load this project's engagement events", eventsResult.error);
  }
  if (tasksResult.error) {
    throw supabaseOperationFailed("load this project's tasks", tasksResult.error);
  }
  if (csResult.error) {
    throw supabaseOperationFailed("load this project's customer success profile", csResult.error);
  }

  return {
    project: projectResult.data as Project,
    engagementEvents: (eventsResult.data ?? []) as EngagementEvent[],
    tasks: (tasksResult.data ?? []) as Task[],
    customerSuccessProfile: (csResult.data ?? null) as CustomerSuccessProfile | null,
  };
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .insert(pickColumns(input, PROJECT_WRITE_COLUMNS))
    .select()
    .single();
  if (error) throw supabaseOperationFailed("create this project", error);
  return data as Project;
}

/** Updates a project through a fixed column list — see the note in `./deals.ts`. */
export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .update(pickColumns(updates, PROJECT_WRITE_COLUMNS))
    .eq("id", id)
    .select()
    .single();
  if (error) throw supabaseOperationFailed("update this project", error);
  return data as Project;
}

/**
 * The deal a project would be created from.
 *
 * Read with `single()`, so a deal that does not exist is an error rather than a null — the
 * caller relies on that to distinguish "no such deal" from "deal is not won".
 */
export async function getDealForProject(dealId: string): Promise<Deal> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("deals").select("*").eq("id", dealId).single();
  if (error) throw supabaseOperationFailed("load the deal for this project", error);
  return data as Deal;
}
