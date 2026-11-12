import { approvalSlaCutoff } from "@/lib/approval-sla";
import { approvalTypeLabel } from "@/lib/approval-types";
import { AdminError } from "@/lib/admin/errors";
import type { ApprovalType } from "@/lib/types";
import { transaction } from "@/server/db/neon.server";
import { createNotification, listApproverProfileIds } from "@/server/repositories/notifications";

/** Every audit row this writer creates is attributable to the system, never to a person. */
export const APPROVAL_SLA_ACTOR_ID = "system:approval-sla";
const APPROVAL_SLA_ACTOR_NAME = "Approval SLA";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_BUDGET_MS = 55_000;

type OverdueApproval = {
  id: string;
  approval_type: ApprovalType | null;
  assigned_to: string | null;
  requested_by_profile_id: string | null;
  agent_run_id: string | null;
  context_summary: string | null;
  created_at: string | Date;
};

export type ApprovalSlaBatchInput = {
  /** Clock used for the cutoff and the age in the audit row; injected so tests are exact. */
  now?: number;
  limit?: number;
  deadlineAt?: number;
};

export type ApprovalSlaBatchResult = {
  cutoff: string;
  scanned: number;
  escalated: number;
  skipped: number;
  notified: number;
  batches: number;
  complete: boolean;
};

function batchLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? DEFAULT_LIMIT)) {
    throw new AdminError("VALIDATION_FAILED", "Invalid approval SLA batch limit");
  }
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_LIMIT)));
}

/**
 * Escalate overdue *pending* approvals without deciding them.
 *
 * Per batch, in one transaction: lock up to `limit` overdue rows with `FOR UPDATE SKIP LOCKED`,
 * stamp `sla_escalated_at`, write one audit row and notify the active approver roster, excluding
 * the proposer whose agent proposal is being escalated. The stamp is the idempotency marker:
 * a rerun selects only still-unstamped rows, so re-delivery from n8n is harmless. The status is
 * never touched — a human reviewer still decides, and "escalated" keeps meaning "request
 * changes". A row decided concurrently is either observed as terminal by the update's
 * `status='pending'` predicate (skipped) or is skipped by the lock entirely; it is never
 * clobbered.
 *
 * Loops until a short batch, an empty batch, or the deadline. Each batch is committed on its
 * own, so a deadline stop loses nothing already escalated.
 */
export async function escalateOverdueApprovalsBatch(
  input: ApprovalSlaBatchInput = {},
): Promise<ApprovalSlaBatchResult> {
  const nowMs = input.now ?? Date.now();
  if (!Number.isFinite(nowMs)) {
    throw new AdminError("VALIDATION_FAILED", "Invalid approval SLA clock");
  }
  const deadlineAt = input.deadlineAt ?? nowMs + DEFAULT_BUDGET_MS;
  if (!Number.isFinite(deadlineAt)) {
    throw new AdminError("VALIDATION_FAILED", "Invalid approval SLA deadline");
  }
  const limit = batchLimit(input.limit);
  const cutoff = approvalSlaCutoff(nowMs).toISOString();
  // The roster is read once per invocation; it is not transaction state and cannot be forged by
  // the managed approval rows.
  const approverIds = await listApproverProfileIds();

  const result: ApprovalSlaBatchResult = {
    cutoff,
    scanned: 0,
    escalated: 0,
    skipped: 0,
    notified: 0,
    batches: 0,
    complete: false,
  };

  while (Date.now() < deadlineAt) {
    const batch = await transaction(async (db) => {
      const rows = (
        await db.query<OverdueApproval>(
          `select id,approval_type,assigned_to,requested_by_profile_id,agent_run_id,
                  context_summary,created_at
           from human_approvals
           where status='pending' and sla_escalated_at is null
             and created_at < $1::timestamptz
           order by created_at,id
           limit $2
           for update skip locked`,
          [cutoff, limit],
        )
      ).rows;

      let escalated = 0,
        skipped = 0,
        notified = 0;
      for (const row of rows) {
        const stamped = (
          await db.query<{ id: string }>(
            `update human_approvals set sla_escalated_at=clock_timestamp()
             where id=$1 and status='pending' and sla_escalated_at is null
             returning id`,
            [row.id],
          )
        ).rows[0];
        if (!stamped) {
          skipped += 1;
          continue;
        }
        escalated += 1;
        const ageMinutes = Math.max(
          0,
          Math.round((nowMs - new Date(row.created_at).getTime()) / 60_000),
        );
        await db.query(
          `insert into activity_logs
             (actor_type,actor_id,actor_name,action,object_type,object_id,diff_data)
           values ('agent',$1,$2,'escalated overdue approval','approval',$3,$4::jsonb)`,
          [
            APPROVAL_SLA_ACTOR_ID,
            APPROVAL_SLA_ACTOR_NAME,
            row.id,
            JSON.stringify({ approval_type: row.approval_type, age_minutes: ageMinutes }),
          ],
        );
        const title = `Approval overdue: ${approvalTypeLabel(row.approval_type)}`;
        for (const userId of approverIds) {
          // The proposer must not be nudged about their own agent proposal; they cannot decide it.
          if (userId === row.requested_by_profile_id) continue;
          const created = await createNotification(
            {
              user_id: userId,
              type: "approval_escalated",
              title,
              body: row.context_summary ?? null,
              object_type: "approval",
              object_id: row.id,
              dedupe_key: `approval_escalated:${row.id}:${userId}`,
            },
            db,
          );
          if (created) notified += 1;
        }
      }
      return { scanned: rows.length, escalated, skipped, notified };
    });

    result.scanned += batch.scanned;
    result.escalated += batch.escalated;
    result.skipped += batch.skipped;
    result.notified += batch.notified;
    result.batches += 1;
    if (batch.scanned < limit) {
      result.complete = true;
      break;
    }
  }

  return result;
}
