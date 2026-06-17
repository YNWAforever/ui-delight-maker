// src/server-functions/projects.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { buildProjectFromWonDeal } from "@/lib/lifecycle-utils";
import type { Deal, Project } from "@/lib/types";

type GetProjectsInput = {
  status?: string;
  owner?: string;
  account_id?: string;
  contact_id?: string;
  deal_id?: string;
};

type CreateProjectInput = Pick<Project, "name"> &
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

export const getProjects = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetProjectsInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase.from("projects").select("*").order("created_at", { ascending: false });

    if (data.status) query = query.eq("status", data.status);
    if (data.owner) query = query.eq("owner", data.owner);
    if (data.account_id) query = query.eq("account_id", data.account_id);
    if (data.contact_id) query = query.eq("contact_id", data.contact_id);
    if (data.deal_id) query = query.eq("deal_id", data.deal_id);

    const { data: projects, error } = await query;
    if (error) throw new Error(error.message);
    return projects as Project[];
  });

export const getProject = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const [projectResult, eventsResult, tasksResult, csResult] = await Promise.all([
      supabase.from("projects").select("*").eq("id", data.id).single(),
      supabase
        .from("engagement_events")
        .select("*")
        .eq("project_id", data.id)
        .order("occurred_at", { ascending: false })
        .limit(50),
      supabase.from("tasks").select("*").eq("project_id", data.id),
      supabase.from("customer_success_profiles").select("*").eq("project_id", data.id).maybeSingle(),
    ]);

    if (projectResult.error) throw new Error(projectResult.error.message);
    if (eventsResult.error) throw new Error(eventsResult.error.message);
    if (tasksResult.error) throw new Error(tasksResult.error.message);
    if (csResult.error) throw new Error(csResult.error.message);

    return {
      project: projectResult.data as Project,
      engagementEvents: eventsResult.data ?? [],
      tasks: tasksResult.data ?? [],
      customerSuccessProfile: csResult.data ?? null,
    };
  });

export const createProject = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateProjectInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: project, error } = await supabase.from("projects").insert(data).select().single();
    if (error) throw new Error(error.message);
    return project as Project;
  });

export const updateProject = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Project> })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: project, error } = await supabase
      .from("projects")
      .update({
        ...(data.updates.account_id !== undefined && { account_id: data.updates.account_id }),
        ...(data.updates.contact_id !== undefined && { contact_id: data.updates.contact_id }),
        ...(data.updates.deal_id !== undefined && { deal_id: data.updates.deal_id }),
        ...(data.updates.quote_id !== undefined && { quote_id: data.updates.quote_id }),
        ...(data.updates.name !== undefined && { name: data.updates.name }),
        ...(data.updates.status !== undefined && { status: data.updates.status }),
        ...(data.updates.start_date !== undefined && { start_date: data.updates.start_date }),
        ...(data.updates.target_end_date !== undefined && {
          target_end_date: data.updates.target_end_date,
        }),
        ...(data.updates.owner !== undefined && { owner: data.updates.owner }),
        ...(data.updates.value !== undefined && { value: data.updates.value }),
        ...(data.updates.currency !== undefined && { currency: data.updates.currency }),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return project as Project;
  });

export const createProjectFromWonDeal = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { dealId: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .select("*")
      .eq("id", data.dealId)
      .single();
    if (dealError) throw new Error(dealError.message);

    const projectDraft = buildProjectFromWonDeal(deal as Deal);
    if (!projectDraft) {
      throw new Error("A project can only be created from a won deal.");
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert(projectDraft)
      .select()
      .single();
    if (projectError) throw new Error(projectError.message);

    return project as Project;
  });
