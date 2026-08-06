import { requireCapability } from "@/server/auth/authorization.server";
// src/server-functions/automation-playbooks.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/legacy-supabase/server";
import type { AutomationPlaybook, AutomationRun } from "@/lib/types";
import { serializeAutomationPlaybook, serializeAutomationRun } from "@/lib/serializable";

type GetAutomationPlaybooksInput = {
  status?: string;
  trigger_type?: string;
};

type CreateAutomationPlaybookInput = Pick<AutomationPlaybook, "name" | "trigger_type"> &
  Partial<Pick<AutomationPlaybook, "description" | "status" | "steps" | "created_by">>;

type CreateAutomationRunInput = Partial<
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

export const getAutomationPlaybooks = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetAutomationPlaybooksInput)
  .handler(async ({ data }) => {
    await requireCapability("automation.manage");
    const supabase = createSupabaseServerClient();
    let query = supabase
      .from("automation_playbooks")
      .select("*")
      .order("created_at", { ascending: false });

    if (data.status) query = query.eq("status", data.status);
    if (data.trigger_type) query = query.eq("trigger_type", data.trigger_type);

    const { data: playbooks, error } = await query;
    if (error) throw new Error(error.message);
    return ((playbooks ?? []) as AutomationPlaybook[]).map(serializeAutomationPlaybook);
  });

export const getAutomationPlaybook = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireCapability("automation.manage", {
      resourceType: "automation_playbook",
      resourceId: data.id,
    });
    const supabase = createSupabaseServerClient();
    const [playbookResult, runsResult] = await Promise.all([
      supabase.from("automation_playbooks").select("*").eq("id", data.id).single(),
      supabase
        .from("automation_runs")
        .select("*")
        .eq("playbook_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (playbookResult.error) throw new Error(playbookResult.error.message);
    if (runsResult.error) throw new Error(runsResult.error.message);

    return {
      playbook: serializeAutomationPlaybook(playbookResult.data as AutomationPlaybook),
      runs: ((runsResult.data ?? []) as AutomationRun[]).map(serializeAutomationRun),
    };
  });

export const createAutomationPlaybook = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateAutomationPlaybookInput)
  .handler(async ({ data }) => {
    await requireCapability("automation.manage");
    const supabase = createSupabaseServerClient();
    const { data: playbook, error } = await supabase
      .from("automation_playbooks")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return serializeAutomationPlaybook(playbook as AutomationPlaybook);
  });

export const updateAutomationPlaybook = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<AutomationPlaybook> })
  .handler(async ({ data }) => {
    await requireCapability("automation.manage", {
      resourceType: "automation_playbook",
      resourceId: data.id,
    });
    const supabase = createSupabaseServerClient();
    const { data: playbook, error } = await supabase
      .from("automation_playbooks")
      .update({
        ...(data.updates.name !== undefined && { name: data.updates.name }),
        ...(data.updates.description !== undefined && { description: data.updates.description }),
        ...(data.updates.trigger_type !== undefined && { trigger_type: data.updates.trigger_type }),
        ...(data.updates.status !== undefined && { status: data.updates.status }),
        ...(data.updates.steps !== undefined && { steps: data.updates.steps }),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return serializeAutomationPlaybook(playbook as AutomationPlaybook);
  });

export const createAutomationRun = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateAutomationRunInput)
  .handler(async ({ data }) => {
    await requireCapability(
      "automation.manage",
      data.playbook_id
        ? { resourceType: "automation_playbook", resourceId: data.playbook_id }
        : data.account_id
          ? { resourceType: "supabase_account", resourceId: data.account_id }
          : {},
    );
    const supabase = createSupabaseServerClient();
    const { data: run, error } = await supabase
      .from("automation_runs")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return serializeAutomationRun(run as AutomationRun);
  });

export const updateAutomationRun = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<AutomationRun> })
  .handler(async ({ data }) => {
    await requireCapability("automation.manage", {
      resourceType: "automation_run",
      resourceId: data.id,
    });
    const supabase = createSupabaseServerClient();
    const { data: run, error } = await supabase
      .from("automation_runs")
      .update({
        ...(data.updates.status !== undefined && { status: data.updates.status }),
        ...(data.updates.output_data !== undefined && { output_data: data.updates.output_data }),
        ...(data.updates.error_message !== undefined && {
          error_message: data.updates.error_message,
        }),
        ...(data.updates.started_at !== undefined && { started_at: data.updates.started_at }),
        ...(data.updates.finished_at !== undefined && { finished_at: data.updates.finished_at }),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return serializeAutomationRun(run as AutomationRun);
  });
