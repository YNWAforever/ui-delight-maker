import { buildFilters } from "@/server/db/query-builders";
import { query, queryOne, transaction } from "@/server/db/neon.server";
import type { ApprovalStatus, HumanApproval } from "@/lib/types";

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

export async function createApproval(input: {
  agent_run_id?: string | null;
  approval_type: "quote_send" | "message_send" | "discount" | "qualification_review";
  requested_by?: string | null;
  assigned_to?: string | null;
  context_data: unknown;
  context_summary?: string | null;
  status?: ApprovalStatus;
}) {
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
  );

  if (!approval) throw new Error("Failed to create approval");
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
