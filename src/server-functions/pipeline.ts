import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type { AgentRun, HumanApproval, Lead, Quote, Task } from "@/lib/types";

export interface PipelineData {
  leads: Lead[];
  quotes: Quote[];
  tasks: Task[];
  approvals: HumanApproval[];
  agentRuns: AgentRun[];
}

export const getPipelineData = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createSupabaseServerClient();
  const [leadsResult, quotesResult, tasksResult, approvalsResult, runsResult] = await Promise.all([
    supabase.from("leads").select("*").order("updated_at", { ascending: false }),
    supabase.from("quotes").select("*").order("updated_at", { ascending: false }),
    supabase.from("tasks").select("*").neq("status", "done").order("due_date", { ascending: true }),
    supabase
      .from("human_approvals")
      .select("*")
      .in("status", ["pending", "escalated"])
      .order("created_at", { ascending: false }),
    supabase.from("agent_runs").select("*").order("created_at", { ascending: false }).limit(50),
  ]);

  const firstError =
    leadsResult.error ??
    quotesResult.error ??
    tasksResult.error ??
    approvalsResult.error ??
    runsResult.error;

  if (firstError) throw new Error(firstError.message);

  return {
    leads: (leadsResult.data ?? []) as Lead[],
    quotes: (quotesResult.data ?? []) as Quote[],
    tasks: (tasksResult.data ?? []) as Task[],
    approvals: (approvalsResult.data ?? []) as HumanApproval[],
    agentRuns: (runsResult.data ?? []) as AgentRun[],
  } satisfies PipelineData;
});
