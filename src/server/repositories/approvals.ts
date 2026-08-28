import { buildFilters } from "@/server/db/query-builders";
import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";
import type { ApprovalStatus, HumanApproval } from "@/lib/types";
import { createNotification, listApproverProfileIds } from "@/server/repositories/notifications";

export async function listApprovals(input: { status?: string } = {}) {
  const where = buildFilters([["status", input.status]]);
  return query<HumanApproval>(
    `
      select *
      from human_approvals
      ${where.sql}
      order by created_at desc
    `,
    where.values,
  );
}

export async function listActiveApprovals() {
  return query<HumanApproval>(
    `
      select *
      from human_approvals
      where status in ('pending','escalated')
      order by created_at desc
    `,
  );
}

export async function getApproval(id: string, db?: Queryable) {
  const approval = await queryOne<HumanApproval>(
    "select * from human_approvals where id = $1",
    [id],
    db,
  );
  if (!approval) throw new Error("Approval not found");
  return approval;
}

/**
 * The open approval for a quote, if there is one.
 *
 * `human_approvals` has no `quote_id` column, so the link lives in `context_data`. The
 * `status = 'pending'` filter comes first and keeps this cheap: decided approvals accumulate,
 * open ones do not. If that stops holding, the fix is an expression index —
 * `activity_logs_diff_account_id_idx` (migration 008) is the precedent.
 */
export async function findPendingApprovalForQuote(quoteId: string, db?: Queryable) {
  return queryOne<HumanApproval>(
    `
      select * from human_approvals
       where status = 'pending' and context_data->>'quote_id' = $1
       limit 1
    `,
    [quoteId],
    db,
  );
}

export async function createApproval(
  input: {
    agent_run_id?: string | null;
    approval_type:
      | "quote_send"
      | "message_send"
      | "discount"
      | "qualification_review"
      | "cs_risk_review";
    requested_by?: string | null;
    assigned_to?: string | null;
    context_data: unknown;
    context_summary?: string | null;
    status?: ApprovalStatus;
  },
  db?: Queryable,
) {
  const approval = await queryOne<HumanApproval>(
    `
      insert into human_approvals
        (agent_run_id, approval_type, requested_by, assigned_to, status, context_data, context_summary)
      values
        ($1, $2, $3, $4, coalesce($5, 'pending'), $6::jsonb, $7)
      returning *
    `,
    [
      input.agent_run_id ?? null,
      input.approval_type,
      input.requested_by ?? null,
      input.assigned_to ?? null,
      input.status ?? null,
      JSON.stringify(input.context_data),
      input.context_summary ?? null,
    ],
    db,
  );

  if (!approval) throw new Error("Failed to create approval");

  const approverIds = await listApproverProfileIds();
  for (const userId of approverIds) {
    await createNotification(
      {
        user_id: userId,
        type: "approval_pending",
        title: `New approval: ${input.approval_type.replace(/_/g, " ")}`,
        body: input.context_summary ?? null,
        object_type: "approval",
        object_id: approval.id,
        dedupe_key: `approval_pending:${approval.id}:${userId}`,
      },
      db,
    );
  }

  return approval;
}

export async function decideApproval(input: {
  id: string;
  decision: "approved" | "rejected" | "escalated";
  notes?: string;
  actorId: string;
}) {
  return transaction(async (client) => {
    const approvalResult = await client.query<HumanApproval>(
      `
        update human_approvals
        set status = $2,
            reviewer_notes = $3,
            decided_at = now()
        where id = $1
        returning *
      `,
      [input.id, input.decision, input.notes ?? null],
    );
    const approval = approvalResult.rows[0];
    if (!approval) throw new Error("Approval not found");

    /**
     * A decided approval releases the agent run that is waiting on it.
     *
     * Runs are parked in `waiting_approval` while a human decides, and `agent_runs_active_idx`
     * (001_clientops_runtime.sql) is a partial unique index over exactly
     * ('running','waiting_approval') for (subject_type, subject_id, workflow_type). A run left
     * parked after its approval is decided therefore blocks every future run of that workflow
     * for that subject — permanently, and for rejections just as much as approvals. This is
     * done here rather than in a per-approval-type handler so that quote_send, message_send
     * and cs_risk_review all release, not just the one that had a handler.
     *
     * `escalated` is not a decision yet, so it keeps the hold. The status predicate keeps this
     * idempotent and stops it overwriting a run that already finished on its own.
     */
    if (approval.agent_run_id && input.decision !== "escalated") {
      await client.query(
        `
          update agent_runs
          set status = 'completed',
              human_review_required = false
          where id = $1 and status = 'waiting_approval'
        `,
        [approval.agent_run_id],
      );
    }

    await client.query(
      `
        insert into activity_logs
          (actor_type, actor_id, action, object_type, object_id)
        values
          ('user', $1, $2, 'approval', $3)
      `,
      [input.actorId, `${input.decision} approval`, input.id],
    );

    return approval;
  });
}

/**
 * Route a pending approval to a reviewer, or clear the assignment.
 *
 * A decided approval cannot be reassigned: its status is no longer `pending`, and changing the
 * reviewer on a closed decision would misrepresent who made it. The guard is `status !==
 * "pending"`, so an `escalated` approval is refused too — it is waiting on a fresh request from
 * the record itself, not on a reviewer.
 *
 * `assignedTo: null` unassigns. That is a real action — an approval routed to the wrong person
 * needs a way back to the unassigned pool — not an error.
 */
export async function assignApproval(input: {
  id: string;
  assignedTo: string | null;
}): Promise<HumanApproval> {
  // `getApproval` throws "Approval not found" itself, so there is no missing-row branch here.
  const existing = await getApproval(input.id);
  if (existing.status !== "pending") {
    throw new Error("A decided approval cannot be reassigned");
  }

  if (input.assignedTo) {
    const profile = await queryOne<{ id: string }>("select id from profiles where id = $1", [
      input.assignedTo,
    ]);
    // Rejected rather than stored: the column is FK-constrained, so a bad id would fail at the
    // database anyway — but failing here gives a message a user can act on.
    if (!profile) throw new Error("Assignee not found");
  }

  const approval = await queryOne<HumanApproval>(
    "update human_approvals set assigned_to = $2 where id = $1 returning *",
    [input.id, input.assignedTo],
  );
  if (!approval) throw new Error("Approval not found");
  return approval;
}
