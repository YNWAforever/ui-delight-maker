import { buildFilters } from "@/server/db/query-builders";
import { AdminError } from "@/lib/admin/errors";
import { evaluateAuthorization } from "@/lib/admin/policy";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { buildVisibilityScope } from "@/server/auth/visibility-scope.server";
import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";
import type { ApprovalStatus, HumanApproval } from "@/lib/types";
import { createNotification, listApproverProfileIds } from "@/server/repositories/notifications";

export async function listApprovals(
  input: { status?: string } = {},
  context: RequestAuthorization,
): Promise<HumanApproval[]> {
  const where = buildFilters([["status", input.status]]);
  const scope = buildVisibilityScope(context, "human_approval", "ha");
  const predicate = scope.sql.replace(
    /\$(\d+)/g,
    (_, index: string) => "$" + (Number(index) + where.values.length),
  );
  const clause = where.sql ? where.sql + " and " + predicate : "where " + predicate;
  return query<HumanApproval>(
    `select ha.id, ha.agent_run_id, ha.approval_type, ha.requested_by,
            ha.assigned_to, ha.status, ha.row_version, ha.superseded_by,
            jsonb_strip_nulls(jsonb_build_object('quote_id', ha.context_data->>'quote_id')) as context_data,
            left(ha.context_summary, 300) as context_summary,
            ha.reviewer_notes, ha.decided_at, ha.created_at
     from human_approvals ha
     ${clause}
     order by ha.created_at desc, ha.id desc`,
    [...where.values, ...scope.values],
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
       where approval_type = 'quote_send'
         and status in ('pending','escalated')
         and context_data->>'quote_id' = $1
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

export type ApprovalDecisionWrite = {
  id: string;
  decision: "approved" | "rejected" | "escalated";
  notes?: string;
  expectedVersion?: number;
};

/** One locked transition, deliberately without its own begin/commit for command composition. */
export async function decideApprovalInTransaction(
  db: Queryable,
  context: RequestAuthorization,
  input: ApprovalDecisionWrite,
  beforeTransition?: (approval: HumanApproval) => Promise<void>,
): Promise<HumanApproval> {
  const current = (
    await db.query<HumanApproval>("select * from human_approvals where id=$1 for update", [
      input.id,
    ])
  ).rows[0];
  if (!current) throw new AdminError("CONFLICT", "Approval is unavailable");
  if (input.expectedVersion !== undefined && current.row_version !== input.expectedVersion) {
    throw new AdminError("STALE_ADMIN_STATE", "Approval changed since it was opened");
  }
  if (current.status !== "pending" && current.status !== "escalated") {
    throw new AdminError("CONFLICT", "Approval already has a terminal decision");
  }
  const decision = evaluateAuthorization({
    actor: context.actor,
    capability: "approvals.decide",
    target: {
      resourceType: "human_approval",
      resourceId: current.id,
      ...(current.assigned_to ? { ownerProfileId: current.assigned_to } : {}),
    },
    overrides: context.overrides,
    now: new Date(),
  });
  if (!decision.allowed) {
    throw new AdminError(
      decision.reason === "outside_scope" ? "OUTSIDE_SCOPE" : "FORBIDDEN",
      "Approval decision is not authorized",
    );
  }
  await beforeTransition?.(current);

  const updated = (
    await db.query<HumanApproval>(
      `update human_approvals
     set status=$2, reviewer_notes=$3,
         decided_at=case when $2='escalated' then null else now() end
     where id=$1 and row_version=$4 and status in ('pending','escalated')
     returning *`,
      [input.id, input.decision, input.notes ?? null, current.row_version],
    )
  ).rows[0];
  if (!updated) throw new AdminError("STALE_ADMIN_STATE", "Approval changed during decision");

  if (updated.agent_run_id && input.decision !== "escalated") {
    await db.query(
      `update agent_runs
       set status='completed', human_review_required=false
       where id=$1 and status='waiting_approval'`,
      [updated.agent_run_id],
    );
  }
  await db.query(
    `insert into activity_logs (actor_type,actor_id,action,object_type,object_id)
     values ('user',$1,$2,'approval',$3)`,
    [context.actor.profileId, `${input.decision} approval`, input.id],
  );
  return updated;
}

/**
 * Route a pending approval to a reviewer, or clear the assignment.
 *
 * A terminal approval cannot be reassigned. Pending and escalated records remain open and
 * may be routed, but a closed decision retains its historical reviewer.
 *
 * `assignedTo: null` unassigns. That is a real action — an approval routed to the wrong person
 * needs a way back to the unassigned pool — not an error.
 */
export async function assignApproval(
  input: { id: string; assignedTo: string | null; expectedVersion?: number },
  context: RequestAuthorization,
): Promise<HumanApproval> {
  return transaction(async (db) => {
    const current = (
      await db.query<HumanApproval>("select * from human_approvals where id=$1 for update", [
        input.id,
      ])
    ).rows[0];
    if (!current) throw new AdminError("CONFLICT", "Approval is unavailable");
    if (input.expectedVersion !== undefined && current.row_version !== input.expectedVersion) {
      throw new AdminError("STALE_ADMIN_STATE", "Approval changed since it was opened");
    }
    if (current.status !== "pending" && current.status !== "escalated") {
      throw new AdminError("CONFLICT", "A decided approval cannot be reassigned");
    }
    const permission = evaluateAuthorization({
      actor: context.actor,
      capability: "approvals.decide",
      target: {
        resourceType: "human_approval",
        resourceId: current.id,
        ...(current.assigned_to ? { ownerProfileId: current.assigned_to } : {}),
      },
      overrides: context.overrides,
      now: new Date(),
    });
    if (!permission.allowed)
      throw new AdminError("FORBIDDEN", "Approval routing is not authorized");

    if (input.assignedTo) {
      const profile = (
        await db.query<{ id: string }>("select id from profiles where id=$1 and status='active'", [
          input.assignedTo,
        ])
      ).rows[0];
      if (!profile) throw new AdminError("VALIDATION_FAILED", "Assignee is unavailable");
    }
    const updated = (
      await db.query<HumanApproval>(
        `update human_approvals set assigned_to=$2
       where id=$1 and row_version=$3 and status in ('pending','escalated')
       returning *`,
        [input.id, input.assignedTo, current.row_version],
      )
    ).rows[0];
    if (!updated) throw new AdminError("STALE_ADMIN_STATE", "Approval changed during routing");
    return updated;
  });
}
