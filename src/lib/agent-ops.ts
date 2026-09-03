import type { AttentionItem } from "@/components/sales";
import { AGENT_RUN_STUCK_MINUTES } from "@/lib/agents";
import { formatDateTime, relativeTime } from "@/lib/format";
import type {
  AgentDirectoryRunSummary,
  AgentRunSummary,
} from "@/server/read-models/agent-workspaces";

/**
 * The product rules behind AI Ops' derived numbers.
 *
 * They live here rather than in `src/routes/agents.tsx` for two reasons. A route file that
 * exports functions loses fast refresh for the whole module, and — the reason that matters —
 * a rule tested through a rendered route is tested through whatever branch the test
 * remembered to mount. Success rate and attention order are decisions about what the page
 * claims, so they are stated once, in one place, and asserted directly.
 */

const STUCK_AFTER_MS = AGENT_RUN_STUCK_MINUTES * 60_000;

/** How many runs the attention queue lists before it stops. */
export const ATTENTION_QUEUE_LIMIT = 8;

/**
 * Share of *settled* runs that completed, or null when nothing has settled.
 *
 * The denominator is deliberately `completed + failed` rather than every run dispatched. A
 * run still in flight is neither a success nor a failure, and dividing by the total would
 * report a falling success rate every time an agent got busy.
 *
 * Null rather than 0 when the denominator is empty: "no runs have finished yet" and "every
 * run failed" are opposite facts, and rendering both as 0% is the kind of quiet lie this
 * revision exists to remove.
 */
export function agentSuccessRate(completed: number, failed: number): number | null {
  const settled = completed + failed;
  if (settled <= 0) return null;
  return completed / settled;
}

/**
 * A run that has sat in `running` past the derived-state threshold.
 *
 * "Stuck" is not a stored status — `agent_runs_status_check` allows four values and that is
 * not one of them — so it is computed, exactly like `Stuck`, `At risk` and `Overdue` in
 * `status-labels.ts`. `now` is a parameter for the usual SSR reason: a component that reads
 * the clock during render produces different markup on the server and on hydration.
 */
export function isStuckRun(run: Pick<AgentRunSummary, "status" | "created_at">, now: number) {
  if (run.status !== "running") return false;
  const started = new Date(run.created_at).getTime();
  if (Number.isNaN(started)) return false;
  return now - started >= STUCK_AFTER_MS;
}

export type AttentionBucket = "stuck" | "failure" | "approval";

/**
 * Attention order is stuck, then failed, then waiting approval — a product decision, not a
 * sort key, which is why `AttentionQueue` renders the array as given and never reorders it.
 *
 * The reasoning: a stuck run is still holding a subject's active-run slot (the partial
 * unique index on `(subject_type, subject_id, workflow_type)` means nothing else can be
 * dispatched for that record until it clears), so it blocks work that has not been asked
 * for yet. A failed run has already stopped and blocks nothing. A run waiting on approval
 * is working exactly as designed and merely needs someone. Within a bucket, oldest first:
 * this is a backlog, not a feed.
 */
export const ATTENTION_ORDER: AttentionBucket[] = ["stuck", "failure", "approval"];

function attentionBucket(
  run: Pick<AgentRunSummary, "status" | "created_at">,
  now: number | null,
): AttentionBucket | null {
  if (run.status === "waiting_approval") return "approval";
  if (run.status === "failed") return "failure";
  // Before the client clock resolves there is no honest way to age a running run, so it is
  // simply not in the queue yet. The KPI strip still shows the server-side stuck count.
  if (now !== null && isStuckRun(run, now)) return "stuck";
  return null;
}

export function buildAgentAttentionItems(
  runs: AgentDirectoryRunSummary[],
  slugByDisplayName: ReadonlyMap<string, string>,
  now: number | null,
  limit: number = ATTENTION_QUEUE_LIMIT,
): AttentionItem[] {
  const buckets = new Map<AttentionBucket, AgentDirectoryRunSummary[]>(
    ATTENTION_ORDER.map((bucket) => [bucket, []]),
  );

  for (const run of runs) {
    const bucket = attentionBucket(run, now);
    if (bucket) buckets.get(bucket)?.push(run);
  }

  const ordered = ATTENTION_ORDER.flatMap((bucket) =>
    [...(buckets.get(bucket) ?? [])]
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
      .map((run) => ({ bucket, run })),
  );

  return ordered.slice(0, limit).map(({ bucket, run }) => {
    const slug = slugByDisplayName.get(run.agent_name);
    return {
      id: run.id,
      severity: bucket,
      title: run.agent_name,
      reason:
        bucket === "stuck"
          ? `Still running after ${AGENT_RUN_STUCK_MINUTES} minutes, so nothing else can be dispatched for the same record.`
          : bucket === "failure"
            ? // A restricted run's output_summary is nulled by loadAgentDirectoryRead the same
              // way a genuinely empty one is, so this cannot tell the two apart on its own —
              // "recorded no summary" would misreport a redaction as missing data. Checked
              // first, and worded like the placeholder loadAgentHistoryPage's readers already
              // see on `/agents/$name`, so the same fact reads the same way everywhere it shows.
              run.subject_restricted
              ? "Summary restricted."
              : (run.output_summary ?? "The run failed and recorded no summary.")
            : "A human decision is required before this run can proceed.",
      age: now === null ? formatDateTime(run.created_at) : relativeTime(run.created_at, now),
      // An approval is decided in AI Review; a stuck or failed run is read in the agent's
      // own history. An `agent_name` the catalogue no longer holds has no detail route, so
      // it goes to the directory rather than to a link that would 404.
      href: bucket === "approval" ? "/ai-review" : slug ? `/agents/${slug}` : "/agents",
    };
  });
}
