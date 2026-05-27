// src/server-functions/agent-runs.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type { AgentRun, AgentToolCall, ActivityLog, DashboardStats } from "@/lib/types";

export const getAgentRuns = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => (data ?? {}) as { agent?: string; status?: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase
      .from("agent_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.agent) query = query.eq("agent_name", data.agent);
    if (data.status) query = query.eq("status", data.status);
    const { data: runs, error } = await query;
    if (error) throw new Error(error.message);
    return runs as AgentRun[];
  });

export const getAgentRun = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const [runResult, callsResult] = await Promise.all([
      supabase.from("agent_runs").select("*").eq("id", data.id).single(),
      supabase
        .from("agent_tool_calls")
        .select("*")
        .eq("agent_run_id", data.id)
        .order("called_at"),
    ]);
    if (runResult.error) throw new Error(runResult.error.message);
    return {
      run: runResult.data as AgentRun,
      toolCalls: (callsResult.data ?? []) as AgentToolCall[],
    };
  });

export const getDashboardStats = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createSupabaseServerClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [leadsRes, quotesRes, approvalsRes, runsRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("status", "in", '("won","lost")'),
    supabase
      .from("quotes")
      .select("total_value")
      .in("status", ["pending_approval", "sent", "viewed"]),
    supabase
      .from("human_approvals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h),
  ]);

  const pendingQuoteValue =
    quotesRes.data?.reduce((sum, q) => sum + (q.total_value ?? 0), 0) ?? 0;

  return {
    openLeads: leadsRes.count ?? 0,
    pendingQuoteValue,
    pendingApprovals: approvalsRes.count ?? 0,
    runs24h: runsRes.count ?? 0,
  } satisfies DashboardStats;
});

export const getActivityLogs = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => (data ?? {}) as { object_id?: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    if (data.object_id) query = query.eq("object_id", data.object_id);
    const { data: logs, error } = await query;
    if (error) throw new Error(error.message);
    return logs as ActivityLog[];
  });
