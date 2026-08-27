import { AGENT_DEFINITIONS } from "@/lib/agents";
import type { AgentRun, HumanApproval } from "@/lib/types";
import { query } from "@/server/db/neon.server";
import { serializeAgentRun, serializeHumanApproval } from "@/lib/serializable";

const DIRECTORY_RUN_LIMIT = 50;
const ATTENTION_RUN_LIMIT = 25;
const SPARKLINE_HOURS = 14;
export const STUCK_RUN_MINUTES = 15;

type AgentAggregateRow = {
  agent_name: string;
  runs_24h: number | string;
  completed_24h: number | string;
  failed_24h: number | string;
  waiting_approval: number | string;
  running: number | string;
  stuck_runs: number | string;
  avg_confidence: number | string | null;
  confidence_samples_24h: number | string;
  tokens_24h: number | string;
  last_run_at: string | null;
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
  | "workflow_type"
  | "trigger_type"
  | "subject_type"
  | "subject_id"
  | "output_summary"
  | "status"
  | "duration_ms"
  | "tokens_used"
  | "confidence_score"
  | "human_review_required"
  | "created_at"
  | "updated_at"
>;

export type AgentAttentionReason = "failed" | "waiting_approval" | "stuck";

export type AgentAttentionRun = AgentRunSummary & {
  attention_reason: AgentAttentionReason;
  age_minutes: number;
};

export type AgentDirectoryRead = {
  operations: {
    runs_24h: number;
    completed_24h: number;
    failed_24h: number;
    success_rate: number | null;
    waiting_approval: number;
    running: number;
    stuck_runs: number;
    needs_attention: number;
    tokens_24h: number;
    avg_confidence: number | null;
  };
  agents: Array<
    (typeof AGENT_DEFINITIONS)[number] & {
      runs_24h: number;
      completed_24h: number;
      failed_24h: number;
      success_rate: number | null;
      waiting_approval: number;
      running: number;
      stuck_runs: number;
      tokens_24h: number;
      avg_confidence: number | null;
      last_run_at: string | null;
      sparkline: number[];
    }
  >;
  attentionRuns: AgentAttentionRun[];
  recentRuns: AgentRunSummary[];
};

/** Already normalized by the route's validator — see normalizeAgentHistoryInput. */
export type AgentHistoryPageInput = {
  agent: string;
  page: number;
  limit: number;
};

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function successRate(completed: number, failed: number) {
  const finished = completed + failed;
  return finished === 0 ? null : completed / finished;
}

function weightedConfidence(rows: AgentAggregateRow[]) {
  let weightedTotal = 0;
  let samples = 0;

  for (const row of rows) {
    const rowSamples = numeric(row.confidence_samples_24h);
    if (row.avg_confidence == null || rowSamples === 0) continue;
    weightedTotal += numeric(row.avg_confidence) * rowSamples;
    samples += rowSamples;
  }

  return samples === 0 ? null : weightedTotal / samples;
}

export async function loadAgentDirectoryRead(): Promise<AgentDirectoryRead> {
  const [aggregateRows, hourlyRows, recentRuns, attentionRuns] = await Promise.all([
    query<AgentAggregateRow>(
      `
        select
          agent_name,
          count(*) filter (
            where created_at >= now() - interval '24 hours'
          )::int as runs_24h,
          count(*) filter (
            where status = 'completed'
              and created_at >= now() - interval '24 hours'
          )::int as completed_24h,
          count(*) filter (
            where status = 'failed'
              and created_at >= now() - interval '24 hours'
          )::int as failed_24h,
          count(*) filter (where status = 'waiting_approval')::int as waiting_approval,
          count(*) filter (where status = 'running')::int as running,
          count(*) filter (
            where status = 'running'
              and updated_at < now() - ($1::integer * interval '1 minute')
          )::int as stuck_runs,
          avg(confidence_score) filter (
            where created_at >= now() - interval '24 hours'
              and confidence_score is not null
          ) as avg_confidence,
          count(confidence_score) filter (
            where created_at >= now() - interval '24 hours'
              and confidence_score is not null
          )::int as confidence_samples_24h,
          coalesce(sum(tokens_used) filter (
            where created_at >= now() - interval '24 hours'
          ), 0)::bigint as tokens_24h,
          max(created_at) as last_run_at
        from agent_runs
        group by agent_name
      `,
      [STUCK_RUN_MINUTES],
    ),
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
          id, agent_name, workflow_type, trigger_type, subject_type, subject_id,
          output_summary, status, duration_ms, tokens_used, confidence_score,
          human_review_required, created_at, updated_at
        from agent_runs
        order by created_at desc
        limit $1
      `,
      [DIRECTORY_RUN_LIMIT],
    ),
    query<AgentAttentionRun>(
      `
        select
          id, agent_name, workflow_type, trigger_type, subject_type, subject_id,
          output_summary, status, duration_ms, tokens_used, confidence_score,
          human_review_required, created_at, updated_at,
          case
            when status = 'failed' then 'failed'
            when status = 'waiting_approval' then 'waiting_approval'
            else 'stuck'
          end as attention_reason,
          greatest(
            0,
            floor(extract(epoch from (now() - updated_at)) / 60)
          )::int as age_minutes
        from agent_runs
        where (status = 'failed' and created_at >= now() - interval '7 days')
          or status = 'waiting_approval'
          or (
            status = 'running'
            and updated_at < now() - ($1::integer * interval '1 minute')
          )
        order by
          case
            when status = 'running' then 0
            when status = 'failed' then 1
            else 2
          end,
          case when status = 'waiting_approval' then updated_at end asc,
          updated_at desc
        limit $2
      `,
      [STUCK_RUN_MINUTES, ATTENTION_RUN_LIMIT],
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

  const operations = aggregateRows.reduce(
    (summary, row) => ({
      runs_24h: summary.runs_24h + numeric(row.runs_24h),
      completed_24h: summary.completed_24h + numeric(row.completed_24h),
      failed_24h: summary.failed_24h + numeric(row.failed_24h),
      waiting_approval: summary.waiting_approval + numeric(row.waiting_approval),
      running: summary.running + numeric(row.running),
      stuck_runs: summary.stuck_runs + numeric(row.stuck_runs),
      tokens_24h: summary.tokens_24h + numeric(row.tokens_24h),
    }),
    {
      runs_24h: 0,
      completed_24h: 0,
      failed_24h: 0,
      waiting_approval: 0,
      running: 0,
      stuck_runs: 0,
      tokens_24h: 0,
    },
  );

  return {
    operations: {
      ...operations,
      success_rate: successRate(operations.completed_24h, operations.failed_24h),
      needs_attention: operations.failed_24h + operations.waiting_approval + operations.stuck_runs,
      avg_confidence: weightedConfidence(aggregateRows),
    },
    agents: AGENT_DEFINITIONS.map((agent) => {
      const aggregate = aggregates.get(agent.display_name);
      const completed24h = numeric(aggregate?.completed_24h);
      const failed24h = numeric(aggregate?.failed_24h);
      return {
        ...agent,
        runs_24h: numeric(aggregate?.runs_24h),
        completed_24h: completed24h,
        failed_24h: failed24h,
        success_rate: successRate(completed24h, failed24h),
        waiting_approval: numeric(aggregate?.waiting_approval),
        running: numeric(aggregate?.running),
        stuck_runs: numeric(aggregate?.stuck_runs),
        tokens_24h: numeric(aggregate?.tokens_24h),
        avg_confidence:
          aggregate?.avg_confidence == null ? null : numeric(aggregate.avg_confidence),
        last_run_at: aggregate?.last_run_at ?? null,
        sparkline: sparklines.get(agent.display_name) ?? Array(SPARKLINE_HOURS).fill(0),
      };
    }),
    attentionRuns,
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
        id, agent_name, workflow_type, trigger_type, subject_type, subject_id,
        output_summary, status, duration_ms, tokens_used, confidence_score,
        human_review_required, created_at, updated_at
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
