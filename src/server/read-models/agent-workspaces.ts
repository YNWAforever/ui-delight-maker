import { AGENT_DEFINITIONS } from "@/lib/agents";
import { decideAgentSubjects } from "@/lib/agent-run-visibility";
import type { Capability } from "@/lib/admin/types";
import type { AgentRun, HumanApproval } from "@/lib/types";
import { query } from "@/server/db/neon.server";
import type { JsonValue, SerializableHumanApproval } from "@/lib/serializable";
import { serializeHumanApproval, toJsonValue } from "@/lib/serializable";
import { loadEffectiveAgentCatalogue } from "@/server/read-models/agent-catalogue";
import type { RowAuthorizer } from "@/server/auth/authorization.server";

/**
 * A per-subject verdict, as `decideAgentSubjects` returns it: `true` only when the actor holds
 * the capability entitling them to that specific row's content, resolved against real ownership
 * rather than the capability alone.
 */
type SubjectDecision = (subjectType: string, subjectId: string) => boolean;

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

/**
 * `AgentRunSummary` after the same per-subject redaction `loadAgentHistoryPage` applies to
 * produce `AgentHistoryItem`: `output_summary`, `subject_id` and `subject_type` nulled, plus
 * `subject_restricted`, when the reader lacks the view capability for the run's subject.
 *
 * `recentRuns` and `attentionRuns` used to ship the raw `AgentRunSummary` — every run's
 * summary and subject, unredacted, to anyone holding `agents.view` — one route over from the
 * history page that gates the same content. Per `quote-workspace.ts`'s `redactLeadIdentity`,
 * the id is the identity: nulling `output_summary` alone would still tell a restricted reader
 * which record the agent ran against, and when.
 */
export type AgentDirectoryRunSummary = Omit<AgentRunSummary, "subject_type" | "subject_id"> & {
  subject_type: string | null;
  subject_id: string | null;
  subject_restricted: boolean;
};

/** The columns the two directory queries select, before per-subject redaction is applied. */
type AgentAttentionRunRow = AgentRunSummary & {
  attention_reason: AgentAttentionReason;
  age_minutes: number;
};

export type AgentAttentionRun = AgentDirectoryRunSummary & {
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
  recentRuns: AgentDirectoryRunSummary[];
};

/** Already normalized by the route's validator — see normalizeAgentHistoryInput. */
export type AgentHistoryPageInput = {
  agent: string;
  page: number;
  limit: number;
  /**
   * What the caller may see, resolved once by `requirePageAuthorization` in the server
   * function. Passed in rather than resolved here, so the read model stays free of the auth
   * layer's session load.
   */
  access: Partial<Record<Capability, boolean>>;
  /**
   * The row-level authorizer from the same `requirePageAuthorization` call. `decideAgentSubjects`
   * uses it to resolve real ownership for every distinct subject on the page, so a `deny`
   * override scoped to one record redacts that record without redacting its neighbours of the
   * same subject type.
   */
  rows: RowAuthorizer;
};

/**
 * The columns the history page selects. Deliberately not `AgentRun`: `output_data` is not
 * selected, because nothing renders it and shipping it disclosed every run's model output to
 * anyone holding `agents.view`.
 */
type AgentHistoryRow = Pick<
  AgentRun,
  | "id"
  | "agent_name"
  | "workflow_type"
  | "trigger_type"
  | "subject_type"
  | "subject_id"
  | "input_data"
  | "output_summary"
  | "status"
  | "duration_ms"
  | "tokens_used"
  | "confidence_score"
  | "human_review_required"
  | "created_at"
  | "updated_at"
>;

/**
 * `subject_restricted` distinguishes "you may not see this" from "this run recorded nothing".
 * Without it, each field falls back to its own "nothing here" placeholder — `input_data` to
 * the UI's em-dash, `output_summary` to "No output summary recorded." — and both placeholders
 * report a permission boundary as missing data.
 *
 * Named for the cause, not the field: it gates `input_data`, `output_summary`, `subject_id` and
 * `subject_type` alike, since `output_summary` is unvalidated model output that routinely
 * restates the subject's identity — and the identity is the same problem again. Per
 * `quote-workspace.ts`'s `redactLeadIdentity`, the id *is* the identity: redacting the content
 * while a restricted row still ships the record it ran against, and when, redacts nothing. Both
 * are widened to `string | null` here because `AgentHistoryRow`'s (via `AgentRun`) are plain
 * `string` — the columns themselves are non-null.
 */
export type AgentHistoryItem = Omit<
  AgentHistoryRow,
  "input_data" | "subject_id" | "subject_type"
> & {
  input_data: JsonValue;
  subject_id: string | null;
  subject_type: string | null;
  subject_restricted: boolean;
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

/**
 * Redacts a directory run row exactly as `loadAgentHistoryPage` redacts `AgentHistoryRow`:
 * `output_summary`, `subject_id` and `subject_type` nulled when the reader lacks the row's
 * subject capability. Shared by `recentRuns`, `attentionRuns` and `loadAiReviewRead`'s
 * `humanReviewRuns` — three read paths that used to ship every run's summary and subject with
 * no per-subject check at all.
 *
 * Takes the per-row decision lookup `decideAgentSubjects` returns, not the capability-level
 * `access` map it used to: a `deny` override scoped to one record has to be able to redact that
 * one row without touching its neighbours of the same subject type, which a capability-only
 * check can never express.
 */
function redactDirectoryRun<T extends AgentRunSummary>(
  run: T,
  decide: SubjectDecision,
): Omit<T, "subject_type" | "subject_id" | "output_summary"> & {
  subject_type: string | null;
  subject_id: string | null;
  output_summary: string | null;
  subject_restricted: boolean;
} {
  const allowed = decide(run.subject_type, run.subject_id);
  return {
    ...run,
    subject_type: allowed ? run.subject_type : null,
    subject_id: allowed ? run.subject_id : null,
    output_summary: allowed ? run.output_summary : null,
    subject_restricted: !allowed,
  };
}

export async function loadAgentDirectoryRead(
  access: Partial<Record<Capability, boolean>>,
  rows: RowAuthorizer,
): Promise<AgentDirectoryRead> {
  const [aggregateRows, hourlyRows, recentRunRows, attentionRunRows, catalogue] = await Promise.all(
    [
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
      query<AgentAttentionRunRow>(
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
      loadEffectiveAgentCatalogue(),
    ],
  );

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

  // One decision per distinct subject type across both lists, before either is mapped — not
  // once per row, and not once per list. recentRuns and attentionRuns can both name the same
  // subject (a run stuck long enough also shows up recently), so deciding them together is what
  // keeps this at one ownership query per subject type rather than two.
  const decide = await decideAgentSubjects(rows, [
    ...recentRunRows.map(({ subject_type, subject_id }) => ({ subject_type, subject_id })),
    ...attentionRunRows.map(({ subject_type, subject_id }) => ({ subject_type, subject_id })),
  ]);

  return {
    operations: {
      ...operations,
      success_rate: successRate(operations.completed_24h, operations.failed_24h),
      needs_attention: operations.failed_24h + operations.waiting_approval + operations.stuck_runs,
      avg_confidence: weightedConfidence(aggregateRows),
    },
    agents: catalogue.map((agent) => {
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
    // Redaction is row-level: `decide` above resolved real ownership for every distinct
    // subject in either list, so a `deny` override scoped to one lead redacts that lead's run
    // without touching another run about a different lead of the same type.
    attentionRuns: attentionRunRows.map((run) => redactDirectoryRun(run, decide)),
    recentRuns: recentRunRows.map((run) => redactDirectoryRun(run, decide)),
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
    query<AgentHistoryRow>(
      `
        select
          id, agent_name, workflow_type, trigger_type, subject_type, subject_id,
          input_data, output_summary, status, duration_ms, tokens_used, confidence_score,
          human_review_required, created_at, updated_at
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

  // One decision per distinct subject type on the page, before any row is mapped — a `deny`
  // override scoped to one lead now redacts that lead's run without redacting a neighbouring
  // row about a different lead of the same subject type.
  const decide = await decideAgentSubjects(
    input.rows,
    runs.map(({ subject_type, subject_id }) => ({ subject_type, subject_id })),
  );

  return {
    items: runs.map((run): AgentHistoryItem => {
      // Row-level: `decide` above resolved real ownership for every distinct subject on the
      // page, so this honours a deny override scoped to one specific subject, not just the
      // capability as a whole.
      //
      // Both content fields ride the one decision. output_summary is unvalidated model output
      // that routinely restates the subject's identity, and it renders on every list row
      // rather than behind an expander — so it was the wider of the two exposures.
      //
      // subject_id and subject_type are nulled on the same decision, not just input_data and
      // output_summary: per quote-workspace.ts's redactLeadIdentity, the id is the identity,
      // and a restricted row that still ships which record the agent ran against — and when —
      // redacts nothing.
      const allowed = decide(run.subject_type, run.subject_id);
      const { input_data, output_summary, subject_id, subject_type, ...rest } = run;
      return {
        ...rest,
        subject_id: allowed ? subject_id : null,
        subject_type: allowed ? subject_type : null,
        input_data: allowed ? toJsonValue(input_data) : null,
        output_summary: allowed ? output_summary : null,
        subject_restricted: !allowed,
      };
    }),
    total,
    page,
    limit: input.limit,
    summary: {
      runs_24h: Number(summary?.runs_24h ?? 0),
      avg_confidence: summary?.avg_confidence == null ? null : Number(summary.avg_confidence),
    },
  };
}

/**
 * A pending approval joined to its run's subject. `subject_type` and `subject_id` decide the
 * redaction and are both stripped before the row is returned — the join exists to answer a
 * question, not to widen the payload.
 *
 * `subject_id` is selected now, deliberately, where PR #76 deliberately did not select it: row-
 * level ownership resolution needs the id to know *which* lead (or account, or quote…) the
 * approval concerns, not just that it concerns a lead. Selecting it here does not undo #76 — it
 * is stripped before `AiReviewApproval` is built, the same way `subject_type` already is, so it
 * never reaches the client. See `loadAiReviewRead` below.
 */
type ApprovalRow = HumanApproval & { subject_type: string | null; subject_id: string | null };

/**
 * `subject_restricted` carries the same meaning here as on the run reads: the reader lacks the
 * view capability for the record this approval concerns, so its content is withheld rather
 * than absent.
 */
export type AiReviewApproval = SerializableHumanApproval & { subject_restricted: boolean };

export async function loadAiReviewRead(
  access: Partial<Record<Capability, boolean>>,
  rows: RowAuthorizer,
) {
  const [approvals, humanReviewRuns] = await Promise.all([
    query<ApprovalRow>(`
      select
        a.id, a.agent_run_id, a.approval_type, a.requested_by, a.assigned_to, a.status,
        a.context_data, a.context_summary, a.reviewer_notes, a.decided_at, a.created_at,
        r.subject_type, r.subject_id
      from human_approvals a
      left join agent_runs r on r.id = a.agent_run_id
      where a.status = 'pending'
      order by a.created_at desc
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

  // One decision per distinct subject type across both approvals and humanReviewRuns, before
  // either is mapped. An approval whose run was deleted (left join miss) has no subject_id to
  // decide against, so it is left out here and denied explicitly below — the same fail-closed
  // outcome `canReadAgentRunInput` gave a null subject_type.
  const decide = await decideAgentSubjects(rows, [
    ...approvals
      .filter(
        (row): row is ApprovalRow & { subject_type: string; subject_id: string } =>
          row.subject_type !== null && row.subject_id !== null,
      )
      .map(({ subject_type, subject_id }) => ({ subject_type, subject_id })),
    ...humanReviewRuns.map(({ subject_type, subject_id }) => ({ subject_type, subject_id })),
  ]);

  return {
    approvals: approvals.map((row): AiReviewApproval => {
      // `subject_type` and `subject_id` are both destructured off so neither can reach the
      // client — `subject_id` exists only to resolve the row's owner above, exactly as
      // `redactLeadIdentity` in quote-workspace.ts treats an id as identity. A left join means
      // both are null for an approval whose run was deleted, which has no subject and so
      // redacts.
      const { subject_type, subject_id, ...approval } = row;
      const allowed =
        subject_type !== null && subject_id !== null && decide(subject_type, subject_id);
      return {
        ...serializeHumanApproval(
          allowed
            ? approval
            : { ...approval, context_data: null, context_summary: null, reviewer_notes: null },
        ),
        subject_restricted: !allowed,
      };
    }),
    // Row-level: `decide` above resolved real ownership for every distinct subject across both
    // arrays, so a `deny` override scoped to one lead redacts that lead's run without redacting
    // a neighbouring run about a different lead of the same subject type.
    humanReviewRuns: humanReviewRuns.map((run) => redactDirectoryRun(run, decide)),
  };
}

export type AgentHistoryPageRead = Awaited<ReturnType<typeof loadAgentHistoryPage>>;
export type AiReviewRead = Awaited<ReturnType<typeof loadAiReviewRead>>;
