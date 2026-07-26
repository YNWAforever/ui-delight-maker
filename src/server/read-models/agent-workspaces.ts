import { AGENT_DEFINITIONS } from "@/lib/agents";
import type { AgentRun, HumanApproval } from "@/lib/types";
import { query } from "@/server/db/neon.server";
import { serializeAgentRun, serializeHumanApproval } from "@/server-functions/serializers";

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

export type AgentRunSummary = Pick<
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

/** Already normalized by the route's validator — see normalizeAgentHistoryInput. */
export type AgentHistoryPageInput = {
  agent: string;
  page: number;
  limit: number;
};

export async function loadAgentDirectoryRead(): Promise<AgentDirectoryRead> {
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
}

export async function loadAgentHistoryPage(input: AgentHistoryPageInput) {
  const countRows = await query<CountRow>(
    "select count(*)::int as total from agent_runs where agent_name = $1",
    [input.agent],
  );
  const total = Number(countRows[0]?.total ?? 0);
  const lastPage = Math.max(1, Math.ceil(total / input.limit));
  const page = Math.min(input.page, lastPage);
  const offset = (page - 1) * input.limit;
  const [runs, summaryRows] = await Promise.all([
    query<AgentRun>(
      `
        select *
        from agent_runs
        where agent_name = $1
        order by created_at desc
        limit $2 offset $3
      `,
      [input.agent, input.limit, offset],
    ),
    query<{ runs_24h: number | string; avg_confidence: number | string | null }>(
      `
        select
          count(*) filter (where created_at >= now() - interval '24 hours')::int as runs_24h,
          avg(confidence_score) filter (where confidence_score is not null) as avg_confidence
        from agent_runs
        where agent_name = $1
      `,
      [input.agent],
    ),
  ]);
  const summary = summaryRows[0];

  return {
    items: runs.map(serializeAgentRun),
    total,
    page,
    limit: input.limit,
    summary: {
      runs_24h: Number(summary?.runs_24h ?? 0),
      avg_confidence: summary?.avg_confidence == null ? null : Number(summary.avg_confidence),
    },
  };
}

export async function loadAiReviewRead() {
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
}

export type AgentHistoryPageRead = Awaited<ReturnType<typeof loadAgentHistoryPage>>;
export type AiReviewRead = Awaited<ReturnType<typeof loadAiReviewRead>>;
