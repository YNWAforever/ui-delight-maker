import { createServerFn } from "@tanstack/react-start";
import { AGENT_DEFINITIONS } from "@/lib/agents";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import type { AgentRun, HumanApproval } from "@/lib/types";
import { requireCapability, requireCapabilityChecks } from "@/server/auth/authorization.server";
import { query } from "@/server/db/neon.server";
import { listActivityLogs } from "@/server/repositories/activity-logs";
import { getAgentRunWithCalls, listAgentRuns } from "@/server/repositories/agent-runs";
import {
  serializeActivityLog,
  serializeAgentRun,
  serializeAgentToolCall,
  serializeHumanApproval,
} from "@/server-functions/serializers";

const AGENT_HISTORY_LIMIT = 25;
const DIRECTORY_RUN_LIMIT = 50;
const SPARKLINE_HOURS = 14;

type AgentAggregateRow = {
  agent_name: string;
  runs_24h: number | string;
  avg_confidence: number | string | null;
};

type AgentHourlyRow = {
  agent_name: string;
  hours_ago: number | string;
  run_count: number | string;
};

type CountRow = { total: number | string };
type AgentRunSummary = Pick<
  AgentRun,
  | "id"
  | "agent_name"
  | "trigger_type"
  | "output_summary"
  | "status"
  | "duration_ms"
  | "tokens_used"
  | "confidence_score"
  | "human_review_required"
  | "created_at"
>;

export type AgentDirectoryRead = {
  agents: Array<
    (typeof AGENT_DEFINITIONS)[number] & {
      runs_24h: number;
      avg_confidence: number | null;
      sparkline: number[];
    }
  >;
  recentRuns: AgentRunSummary[];
};

export function normalizeAgentHistoryInput(input: {
  agent?: unknown;
  page?: unknown;
  limit?: unknown;
}) {
  const agent = typeof input.agent === "string" ? input.agent.trim() : "";
  if (!agent) throw new Error("Agent is required");

  const requestedPage = Number(input.page);
  const requestedLimit = Number(input.limit);
  return {
    agent,
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    limit:
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, AGENT_HISTORY_LIMIT)
        : AGENT_HISTORY_LIMIT,
  };
}

export const getAgentRuns = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as { agent?: string; status?: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    const runs = await listAgentRuns(data);
    return runs.map(serializeAgentRun);
  });

export const getAgentDirectoryRead = createServerFn({ method: "GET" }).handler(async () => {
  await requireCapability("agents.view");

  const [aggregateRows, hourlyRows, recentRuns] = await Promise.all([
    query<AgentAggregateRow>(`
      select
        agent_name,
        count(*) filter (where created_at >= now() - interval '24 hours')::int as runs_24h,
        avg(confidence_score) filter (
          where created_at >= now() - interval '24 hours' and confidence_score is not null
        ) as avg_confidence
      from agent_runs
      where created_at >= now() - interval '24 hours'
      group by agent_name
    `),
    query<AgentHourlyRow>(`
      select
        agent_name,
        floor(extract(epoch from (now() - created_at)) / 3600)::int as hours_ago,
        count(*)::int as run_count
      from agent_runs
      where created_at >= now() - interval '14 hours'
      group by agent_name, hours_ago
    `),
    query<AgentRunSummary>(
      `
        select
          id, agent_name, trigger_type, output_summary, status, duration_ms,
          tokens_used, confidence_score, human_review_required, created_at
        from agent_runs
        order by created_at desc
        limit $1
      `,
      [DIRECTORY_RUN_LIMIT],
    ),
  ]);

  const aggregates = new Map(aggregateRows.map((row) => [row.agent_name, row]));
  const sparklines = new Map<string, number[]>();
  for (const row of hourlyRows) {
    const hoursAgo = Number(row.hours_ago);
    if (hoursAgo < 0 || hoursAgo >= SPARKLINE_HOURS) continue;
    const sparkline = sparklines.get(row.agent_name) ?? Array(SPARKLINE_HOURS).fill(0);
    sparkline[SPARKLINE_HOURS - 1 - hoursAgo] = Number(row.run_count);
    sparklines.set(row.agent_name, sparkline);
  }

  return {
    agents: AGENT_DEFINITIONS.map((agent) => {
      const aggregate = aggregates.get(agent.display_name);
      return {
        ...agent,
        runs_24h: Number(aggregate?.runs_24h ?? 0),
        avg_confidence: aggregate?.avg_confidence == null ? null : Number(aggregate.avg_confidence),
        sparkline: sparklines.get(agent.display_name) ?? Array(SPARKLINE_HOURS).fill(0),
      };
    }),
    recentRuns,
  } satisfies AgentDirectoryRead;
});

export const getAgentHistoryPage = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    normalizeAgentHistoryInput(
      (data ?? {}) as { agent?: unknown; page?: unknown; limit?: unknown },
    ),
  )
  .handler(async ({ data }) => {
    await requireCapability("agents.view");
    const offset = (data.page - 1) * data.limit;
    const [countRows, runs, summaryRows] = await Promise.all([
      query<CountRow>("select count(*)::int as total from agent_runs where agent_name = $1", [
        data.agent,
      ]),
      query<AgentRun>(
        `
          select *
          from agent_runs
          where agent_name = $1
          order by created_at desc
          limit $2 offset $3
        `,
        [data.agent, data.limit, offset],
      ),
      query<{ runs_24h: number | string; avg_confidence: number | string | null }>(
        `
          select
            count(*) filter (where created_at >= now() - interval '24 hours')::int as runs_24h,
            avg(confidence_score) filter (where confidence_score is not null) as avg_confidence
          from agent_runs
          where agent_name = $1
        `,
        [data.agent],
      ),
    ]);
    const summary = summaryRows[0];

    return {
      items: runs.map(serializeAgentRun),
      total: Number(countRows[0]?.total ?? 0),
      page: data.page,
      limit: data.limit,
      summary: {
        runs_24h: Number(summary?.runs_24h ?? 0),
        avg_confidence: summary?.avg_confidence == null ? null : Number(summary.avg_confidence),
      },
    };
  });

export const getAiReviewRead = createServerFn({ method: "GET" }).handler(async () => {
  await requireCapabilityChecks([{ capability: "approvals.view" }, { capability: "agents.view" }]);

  const [approvals, humanReviewRuns] = await Promise.all([
    query<HumanApproval>(`
      select *
      from human_approvals
      where status = 'pending'
      order by created_at desc
      limit 100
    `),
    query<AgentRunSummary>(`
      select
        id, agent_name, trigger_type, output_summary, status, duration_ms,
        tokens_used, confidence_score, human_review_required, created_at
      from agent_runs
      where human_review_required = true
      order by created_at desc
      limit 100
    `),
  ]);

  return {
    approvals: approvals.map(serializeHumanApproval),
    humanReviewRuns,
  };
});

export const getAgentRun = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    const result = await getAgentRunWithCalls(data.id);
    return {
      run: serializeAgentRun(result.run),
      toolCalls: result.toolCalls.map(serializeAgentToolCall),
    };
  });

export const getActivityLogs = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as { object_id?: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    const logs = await listActivityLogs(data);
    return logs.map(serializeActivityLog);
  });
