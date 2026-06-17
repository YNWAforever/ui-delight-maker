// src/server-functions/agent-runs.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { calculateWeightedForecast } from "@/lib/lifecycle-utils";
import type {
  ActivityLog,
  AgentRun,
  AgentToolCall,
  CustomerSuccessProfile,
  DashboardStats,
  Deal,
} from "@/lib/types";

export const getAgentRuns = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as { agent?: string; status?: string })
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
  .validator((data: unknown) => data as { id: string })
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

  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [leadsRes, quotesRes, approvalsRes, runsRes, dealsRes, campaignDealsRes, csProfilesRes] =
    await Promise.all([
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
      supabase
        .from("deals")
        .select("id, stage, status, value, probability, expected_close_date")
        .eq("status", "open"),
      supabase
        .from("deals")
        .select("id, source_campaign_id, status, value")
        .eq("status", "won")
        .not("source_campaign_id", "is", null),
      supabase
        .from("customer_success_profiles")
        .select("health_score, renewal_date, renewal_risk"),
    ]);

  const pendingQuoteValue =
    quotesRes.data?.reduce((sum, q) => sum + (q.total_value ?? 0), 0) ?? 0;
  const forecast = calculateWeightedForecast((dealsRes.data ?? []) as Deal[]);
  const campaignSourcedRevenue =
    campaignDealsRes.data?.reduce((sum, deal) => sum + (deal.value ?? 0), 0) ?? 0;
  const csProfiles = (csProfilesRes.data ?? []) as CustomerSuccessProfile[];
  const healthTotal = csProfiles.reduce((sum, profile) => sum + profile.health_score, 0);

  return {
    openLeads: leadsRes.count ?? 0,
    pendingQuoteValue,
    pendingApprovals: approvalsRes.count ?? 0,
    runs24h: runsRes.count ?? 0,
    openPipeline: forecast.openValue,
    weightedForecast: forecast.weightedValue,
    campaignSourcedRevenue,
    averageAccountHealth: csProfiles.length > 0 ? Math.round(healthTotal / csProfiles.length) : 0,
    renewalsDue30: csProfiles.filter(
      (profile) => profile.renewal_date !== null && profile.renewal_date <= in30Days,
    ).length,
    highRiskAccounts: csProfiles.filter((profile) => profile.renewal_risk === "high").length,
  } satisfies DashboardStats;
});

export const getActivityLogs = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as { object_id?: string })
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
