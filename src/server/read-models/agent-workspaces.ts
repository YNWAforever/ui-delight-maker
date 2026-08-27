import { AGENT_DEFINITIONS, AGENT_RUN_STUCK_MINUTES } from "@/lib/agents";
import type { AgentRun, HumanApproval } from "@/lib/types";
import { query } from "@/server/db/neon.server";
import { serializeAgentRun, serializeHumanApproval } from "@/lib/serializable";

const DIRECTORY_RUN_LIMIT = 50;
const SPARKLINE_HOURS = 14;

type AgentAggregateRow = {
  agent_name: string;
  runs_24h: number | string;
  completed_24h: number | string;
  failed_24h: number | string;
  avg_confidence: number | string | null;
  waiting_approval: number | string;
  running: number | string;
  stuck: number | string;
  last_run_at: string | Date | null;
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

/**
 * The counters one agent contributes to the directory.
 *
 * Two different windows on purpose, and the UI has to label them as such. `runs_24h`,
 * `completed_24h` and `failed_24h` describe the last twenty-four hours, because a success
 * rate over all time tells an operator nothing about today. `waiting_approval`, `running`
 * and `stuck` are *current state* and are therefore unbounded: a run that has been wedged
 * for three days is exactly the one worth showing, and a 24-hour window would hide it.
 *
 * There is no `success_rate` field. A rate needs a denominator decision — runs still in
 * flight are neither successes nor failures — and making that decision in SQL would bury it
 * where no reader of the page can check it. The two counts travel instead, and
 * `agentSuccessRate` in the route derives the rate from them, returning null rather than
 * 0% when nothing has settled yet.
 */
export type AgentDirectoryCounters = {
  runs_24h: number;
  completed_24h: number;
  failed_24h: number;
  avg_confidence: number | null;
  waiting_approval: number;
  running: number;
  stuck: number;
};

export type AgentDirectoryRead = {
  agents: Array<
    (typeof AGENT_DEFINITIONS)[number] &
      AgentDirectoryCounters & {
        sparkline: number[];
        /** ISO timestamp of this agent's most recent run, or null if it has never run. */
        last_run_at: string | null;
      }
  >;
  /**
   * Workspace totals, summed over **every** `agent_name` in `agent_runs` — including names
   * that are not in `AGENT_DEFINITIONS`.
   *
   * The per-agent list can only show catalogued agents, so summing the cards would quietly
   * under-report the moment a workflow writes a name the catalogue has since renamed. That
   * drift has happened in this codebase before (see the header comment on AGENT_DEFINITIONS),
   * and a KPI strip that disagrees with the database is the defect this whole revision is
   * about. Costs no extra query: it is a fold over the same aggregate rows.
   */
  totals: Omit<AgentDirectoryCounters, "avg_confidence"> & { avg_confidence: number | null };
  recentRuns: AgentRunSummary[];
};

/** Already normalized by the route's validator — see normalizeAgentHistoryInput. */
export type AgentHistoryPageInput = {
  agent: string;
  page: number;
  limit: number;
};

/**
 * One aggregate pass over `agent_runs`, not four.
 *
 * The 24-hour `where` clause this replaces was not saving a scan: `agent_runs` carries no
 * index on `created_at` (`neon/migrations/001_clientops_runtime.sql:197-199` indexes the
 * subject and the active-run pair, nothing else), so the filtered form was already a
 * sequential scan. Dropping it to `filter (...)` clauses buys current-state counts, a true
 * `max(created_at)`, and stuck detection for the same single pass — where a separate query
 * per fact would have been three more scans, and the route's query budget is three.
 *
 * The status literals are the four `agent_runs_status_check` allows. `ready_for_review`
 * appears in the status-label map for other sources and is deliberately absent here: the
 * check constraint cannot produce it, so counting it would be counting nothing.
 */
const AGENT_AGGREGATE_SQL = `
      select
        agent_name,
        count(*) filter (where created_at >= now() - interval '24 hours')::int as runs_24h,
        count(*) filter (
          where created_at >= now() - interval '24 hours' and status = 'completed'
        )::int as completed_24h,
        count(*) filter (
          where created_at >= now() - interval '24 hours' and status = 'failed'
        )::int as failed_24h,
        avg(confidence_score) filter (
          where created_at >= now() - interval '24 hours' and confidence_score is not null
        ) as avg_confidence,
        count(*) filter (where status = 'waiting_approval')::int as waiting_approval,
        count(*) filter (where status = 'running')::int as running,
        count(*) filter (
          where status = 'running' and created_at < now() - (interval '1 minute' * $1::int)
        )::int as stuck,
        max(created_at) as last_run_at
      from agent_runs
      group by agent_name
`;

function toCount(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoOrNull(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function loadAgentDirectoryRead(): Promise<AgentDirectoryRead> {
  const [aggregateRows, hourlyRows, recentRuns] = await Promise.all([
    query<AgentAggregateRow>(AGENT_AGGREGATE_SQL, [AGENT_RUN_STUCK_MINUTES]),
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

  // Confidence is a mean, so the workspace figure has to be re-weighted by run count
  // rather than averaged across agents: five agents with one run each and one agent with
  // two hundred are not equal votes on "how confident was the AI today".
  let confidenceWeight = 0;
  let confidenceSum = 0;
  const totals = {
    runs_24h: 0,
    completed_24h: 0,
    failed_24h: 0,
    waiting_approval: 0,
    running: 0,
    stuck: 0,
  };
  for (const row of aggregateRows) {
    const runs24h = toCount(row.runs_24h);
    totals.runs_24h += runs24h;
    totals.completed_24h += toCount(row.completed_24h);
    totals.failed_24h += toCount(row.failed_24h);
    totals.waiting_approval += toCount(row.waiting_approval);
    totals.running += toCount(row.running);
    totals.stuck += toCount(row.stuck);
    if (row.avg_confidence != null && runs24h > 0) {
      confidenceSum += Number(row.avg_confidence) * runs24h;
      confidenceWeight += runs24h;
    }
  }

  return {
    agents: AGENT_DEFINITIONS.map((agent) => {
      const aggregate = aggregates.get(agent.display_name);
      return {
        ...agent,
        runs_24h: toCount(aggregate?.runs_24h),
        completed_24h: toCount(aggregate?.completed_24h),
        failed_24h: toCount(aggregate?.failed_24h),
        avg_confidence: aggregate?.avg_confidence == null ? null : Number(aggregate.avg_confidence),
        waiting_approval: toCount(aggregate?.waiting_approval),
        running: toCount(aggregate?.running),
        stuck: toCount(aggregate?.stuck),
        last_run_at: toIsoOrNull(aggregate?.last_run_at),
        sparkline: sparklines.get(agent.display_name) ?? Array(SPARKLINE_HOURS).fill(0),
      };
    }),
    totals: {
      ...totals,
      avg_confidence: confidenceWeight === 0 ? null : confidenceSum / confidenceWeight,
    },
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
