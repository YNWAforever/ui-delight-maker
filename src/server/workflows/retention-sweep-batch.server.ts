import { createHash } from "node:crypto";
import { z } from "zod";
import { parseOperationInput } from "@/lib/operations/errors";
import { resolveDispatchableAgent } from "@/lib/agents";
import { query, transaction, type Queryable } from "@/server/db/neon.server";
import { createNotification } from "@/server/repositories/notifications";
import { loadAgentPolicies } from "@/server/repositories/agent-policy";
import { createAgentRun } from "@/server/repositories/agent-runs";
import { getN8nDispatchConfig, n8nFailureOutcome, triggerN8n } from "@/lib/n8n";
import { buildScoreRenewalRiskPayload } from "@/lib/workflows/payloads";
import {
  buildRenewalWindowDedupeKey,
  buildStaleTouchpointDedupeKey,
  getBoundaryCrossed,
  isEngagementStale,
} from "@/lib/retention-sweep-utils";
import {
  claimRetentionSweep,
  requireSweepLease,
  listRetentionCandidates,
  checkpointRetentionSweep,
  retentionSweepTotals,
  type SweepCandidate,
  type SweepItem,
} from "@/server/repositories/retention-sweeps";
const schema = z.object({
  sweepId: z.string().uuid(),
  today: z.iso.date(),
  cursor: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(50).default(50),
  deadlineAt: z.number().finite(),
});
const DISPATCH_AND_CHECKPOINT_MS = 20000;
export function retentionSweepId(today: string) {
  const hash = createHash("sha256")
    .update("clientops-retention-sweep:" + today)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
async function notifications(db: Queryable, e: SweepCandidate, today: string, admins: string[]) {
  const recipients = e.owner ? [e.owner] : admins;
  let renewal = 0,
    stale = 0;
  const boundary = getBoundaryCrossed(e.renewal_date, today);
  if (boundary && e.renewal_date)
    for (const userId of recipients) {
      if (
        await createNotification(
          {
            user_id: userId,
            type: "renewal_window",
            title: `${e.client_company_name} renews ${boundary === "overdue" ? "in the past" : `in ${boundary} days`}`,
            body: `Engagement ${e.id} crosses the ${boundary} boundary.`,
            object_type: "engagement",
            object_id: e.id,
            dedupe_key: buildRenewalWindowDedupeKey(e.id, boundary, e.renewal_date),
          },
          db,
        )
      )
        renewal++;
    }
  if (isEngagementStale({ lastTouchAt: e.last_touch_at, startDate: e.start_date, today }))
    for (const userId of recipients) {
      if (
        await createNotification(
          {
            user_id: userId,
            type: "stale_touchpoint",
            title: `${e.client_company_name} has no recent touchpoint`,
            body: `Engagement ${e.id} has not been touched in 30+ days.`,
            object_type: "engagement",
            object_id: e.id,
            dedupe_key: buildStaleTouchpointDedupeKey(e.id, e.last_touch_at),
          },
          db,
        )
      )
        stale++;
    }
  return { renewal, stale, boundary };
}
type ItemResult = {
  recorded: boolean;
  notified: number;
  dispatched: number;
  failed: number;
  ambiguous: number;
  renewal: number;
  stale: number;
};
async function processCandidate(
  sweepId: string,
  leaseId: string,
  e: SweepCandidate,
  today: string,
  admins: string[],
  policies: Awaited<ReturnType<typeof loadAgentPolicies>>,
  deadlineAt: number,
): Promise<ItemResult> {
  const config = getN8nDispatchConfig(process.env.N8N_SCORE_RENEWAL_RISK_WEBHOOK_URL);
  const dispatchable = resolveDispatchableAgent("score_renewal_risk", policies);
  const prepared = await transaction(async (db) => {
    await requireSweepLease(db, sweepId, leaseId);
    const existing = (
      await db.query<SweepItem>(
        "select * from retention_sweep_items where sweep_id=$1 and engagement_id=$2 and action='engagement' for update",
        [sweepId, e.id],
      )
    ).rows[0];
    if (existing && existing.state !== "intent")
      return { runId: null, renewal: 0, stale: 0, existing: true };
    await db.query(
      "insert into retention_sweep_items(sweep_id,engagement_id,action,state) values($1,$2,'engagement','intent') on conflict do nothing",
      [sweepId, e.id],
    );
    const counts = await notifications(db, e, today, admins);
    let runId: string | null = null;
    if (counts.boundary && config && dispatchable.dispatchable) {
      const active = (
        await db.query(
          "select id from agent_runs where subject_type='engagement' and subject_id=$1 and workflow_type='score_renewal_risk' and status in ('running','waiting_approval') limit 1",
          [e.id],
        )
      ).rows[0];
      if (!active) {
        const { run, created } = await createAgentRun(
          {
            agent_name: dispatchable.agent.display_name,
            workflow_type: "score_renewal_risk",
            subject_id: e.id,
            subject_type: "engagement",
            trigger_type: "schedule",
            input_data: {
              engagement_id: e.id,
              trigger: "retention_sweep",
              sweep_id: sweepId,
              boundary: counts.boundary,
            },
            created_by: null,
          },
          db,
        );
        if (created) runId = run.id;
      }
    }
    if (runId)
      await db.query(
        "insert into retention_sweep_items(sweep_id,engagement_id,action,state,run_id) values($1,$2,'dispatch','intent',$3)",
        [sweepId, e.id, runId],
      );
    await db.query(
      "update retention_sweep_items set renewal_notified=$3,stale_notified=$4,state=$5,reason_code=$6,updated_at=clock_timestamp() where sweep_id=$1 and engagement_id=$2 and action='engagement'",
      [
        sweepId,
        e.id,
        counts.renewal + (existing?.renewal_notified ?? 0),
        counts.stale + (existing?.stale_notified ?? 0),
        runId ? "intent" : "acknowledged",
        runId ? null : "NO_NEW_DISPATCH",
      ],
    );
    return { runId, renewal: counts.renewal, stale: counts.stale, existing: false };
  });
  const result: ItemResult = {
    recorded: true,
    notified: prepared.renewal + prepared.stale,
    dispatched: 0,
    failed: 0,
    ambiguous: 0,
    renewal: prepared.renewal,
    stale: prepared.stale,
  };
  if (!prepared.runId || !config) return result;
  let accepted = false;
  const finish = async (state: "acknowledged" | "failed" | "ambiguous" | "skipped", code: string) =>
    transaction(async (db) => {
      await requireSweepLease(db, sweepId, leaseId);
      await db.query(
        "update retention_sweep_items set state=$3,reason_code=$4,updated_at=clock_timestamp() where sweep_id=$1 and engagement_id=$2 and action in ('dispatch','engagement') and state='intent'",
        [sweepId, e.id, state, code],
      );
      if (state !== "acknowledged")
        await db.query(
          "update agent_runs set status='failed',outcome_code=$2,output_summary='Retention dispatch needs local review.' where id=$1 and status='running'",
          [
            prepared.runId,
            state === "ambiguous"
              ? "dispatch_ambiguous"
              : state === "skipped"
                ? "cancelled"
                : "provider_error",
          ],
        );
    });
  try {
    if (deadlineAt - Date.now() < DISPATCH_AND_CHECKPOINT_MS) {
      await finish("skipped", "DEADLINE_BEFORE_SEND");
      return result;
    }
    // Durable intent is committed before HTTP. HTTP never runs inside a database transaction.
    await triggerN8n(
      config,
      buildScoreRenewalRiskPayload({ engagementId: e.id, agentRunId: prepared.runId }),
    );
    accepted = true;
    await finish("acknowledged", "WEBHOOK_ACCEPTED");
    result.dispatched = 1;
  } catch (error) {
    const ambiguous = accepted || n8nFailureOutcome(error) === "dispatch_ambiguous";
    try {
      await finish(
        ambiguous ? "ambiguous" : "failed",
        ambiguous ? "DISPATCH_UNCONFIRMED" : "DISPATCH_FAILED",
      );
      result.ambiguous = Number(ambiguous);
      result.failed = Number(!ambiguous);
    } catch {
      result.recorded = false;
    }
  }
  return result;
}
export async function runRetentionSweepBatch(raw: unknown) {
  const input = parseOperationInput(schema, raw),
    deadlineAt = Math.min(input.deadlineAt, Date.now() + 55000);
  const { sweep, leaseId, busy } = await claimRetentionSweep(input);
  let cursor = sweep.cursor,
    scanned = 0,
    notified = 0,
    dispatched = 0,
    failed = 0,
    ambiguous = 0,
    renewalNotified = 0,
    staleNotified = 0,
    complete = sweep.complete;
  if (leaseId) {
    const candidates = await listRetentionCandidates(sweep, input.limit);
    const admins = (
      await query<{ id: string }>(
        "select id from profiles where role in ('admin','super_admin') and status='active'",
      )
    ).map((p) => p.id);
    let recordedAll = true;
    for (let i = 0; i < candidates.length; i += 3) {
      if (deadlineAt - Date.now() < DISPATCH_AND_CHECKPOINT_MS) break;
      const policies = await loadAgentPolicies();
      const round = candidates.slice(i, i + 3);
      const settled = await Promise.allSettled(
        round.map((e) =>
          processCandidate(input.sweepId, leaseId, e, sweep.today, admins, policies, deadlineAt),
        ),
      );
      const outcomes = settled.map((r) => (r.status === "fulfilled" ? r.value : null));
      if (outcomes.some((r) => !r?.recorded)) {
        recordedAll = false;
        break;
      }
      for (const r of outcomes) {
        if (!r) continue;
        notified += r.notified;
        dispatched += r.dispatched;
        failed += r.failed;
        ambiguous += r.ambiguous;
        renewalNotified += r.renewal;
        staleNotified += r.stale;
      }
      scanned += round.length;
      cursor = round.at(-1)!.id;
    }
    complete = recordedAll && scanned === candidates.length && candidates.length < input.limit;
    await checkpointRetentionSweep(input.sweepId, leaseId, cursor, complete);
  }
  return {
    sweepId: input.sweepId,
    today: sweep.today,
    nextCursor: cursor,
    scanned,
    notified,
    dispatched,
    failed,
    ambiguous,
    complete,
    busy,
    renewalNotified,
    staleNotified,
    totals: await retentionSweepTotals(input.sweepId),
  };
}
export async function runRetentionSweep(today: string) {
  const result = await runRetentionSweepBatch({
    sweepId: retentionSweepId(today),
    today,
    limit: 50,
    deadlineAt: Date.now() + 55000,
  });
  return { ...result, engagementsScanned: result.scanned, rescoreDispatched: result.dispatched };
}
