import { AdminError } from "@/lib/admin/errors";
import { evaluateAuthorization } from "@/lib/admin/policy";
import type { HumanApproval } from "@/lib/types";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { type Queryable, transaction } from "@/server/db/neon.server";
import { claimCommandReceipt, completeCommandReceipt } from "./receipts.server";

export type MessageHandoff = {
  approval_id: string;
  handoff_status: "awaiting_manual_send" | "manual_send_recorded";
  sent_reference: string | null;
  recorded_by: string | null;
  recorded_at: string | null;
};

/** A decision creates a human work item; it never dispatches a customer message. */
export async function createMessageHandoffInTransaction(
  db: Queryable,
  approval: HumanApproval,
): Promise<void> {
  if (approval.approval_type !== "message_send" || approval.status !== "approved") return;
  await db.query(
    `insert into approval_message_handoffs (approval_id,handoff_status)
     values ($1,'awaiting_manual_send')`,
    [approval.id],
  );
  if (approval.agent_run_id) {
    await db.query(
      `update agent_runs set outcome_code='awaiting_manual_send',
         output_data=coalesce(output_data,'{}'::jsonb) ||
           jsonb_build_object('handoff_status','awaiting_manual_send')
       where id=$1 and status='completed'`,
      [approval.agent_run_id],
    );
  }
}

export async function recordManualMessageSentCommand(
  context: RequestAuthorization,
  input: { approvalId: string; reference: string; idempotencyKey: string },
): Promise<MessageHandoff> {
  return transaction(async (db) => {
    const reference = input.reference.trim();
    if (reference.length < 3 || reference.length > 255) {
      throw new AdminError("VALIDATION_FAILED", "A manual send reference is required");
    }
    const receipt = await claimCommandReceipt<MessageHandoff>(db, {
      scope: "message.manual_send",
      actorId: context.actor.profileId,
      idempotencyKey: input.idempotencyKey,
      payload: { approvalId: input.approvalId, reference },
    });
    if (receipt.kind === "replay") return receipt.result;
    const approval = (
      await db.query<HumanApproval>("select * from human_approvals where id=$1 for update", [
        input.approvalId,
      ])
    ).rows[0];
    if (!approval || approval.approval_type !== "message_send" || approval.status !== "approved") {
      throw new AdminError("CONFLICT", "Approved message draft is unavailable");
    }
    const permission = evaluateAuthorization({
      actor: context.actor,
      capability: "approvals.decide",
      target: {
        resourceType: "human_approval",
        resourceId: approval.id,
        ...(approval.assigned_to ? { ownerProfileId: approval.assigned_to } : {}),
      },
      overrides: context.overrides,
      now: new Date(),
    });
    if (!permission.allowed) {
      throw new AdminError(
        permission.reason === "outside_scope" ? "OUTSIDE_SCOPE" : "FORBIDDEN",
        "Manual handoff is not authorized",
      );
    }
    const handoff = (
      await db.query<MessageHandoff>(
        "select * from approval_message_handoffs where approval_id=$1 for update",
        [approval.id],
      )
    ).rows[0];
    if (!handoff || handoff.handoff_status !== "awaiting_manual_send") {
      throw new AdminError("CONFLICT", "Manual handoff is not awaiting a send statement");
    }
    const recorded = (
      await db.query<MessageHandoff>(
        `update approval_message_handoffs
         set handoff_status='manual_send_recorded',sent_reference=$2,
             recorded_by=$3,recorded_at=now()
         where approval_id=$1 and handoff_status='awaiting_manual_send'
         returning *`,
        [approval.id, reference, context.actor.profileId],
      )
    ).rows[0];
    if (!recorded) throw new AdminError("CONFLICT", "Manual handoff changed");
    if (approval.agent_run_id) {
      await db.query(
        `update agent_runs set outcome_code='manual_send_recorded',
           output_data=coalesce(output_data,'{}'::jsonb) ||
             jsonb_build_object('handoff_status','manual_send_recorded')
         where id=$1 and status='completed'`,
        [approval.agent_run_id],
      );
    }
    await db.query(
      `insert into activity_logs (actor_type,actor_id,action,object_type,object_id,diff_data)
       values ('user',$1,'recorded manual message send','approval',$2,$3::jsonb)`,
      [context.actor.profileId, approval.id, JSON.stringify({ reference })],
    );
    await completeCommandReceipt(db, receipt.id, recorded);
    return recorded;
  });
}
