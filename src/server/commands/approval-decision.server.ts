import type { HumanApproval } from "@/lib/types";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { transaction } from "@/server/db/neon.server";
import {
  decideApprovalInTransaction,
  type ApprovalDecisionWrite,
} from "@/server/repositories/approvals";
import { claimCommandReceipt, completeCommandReceipt } from "./receipts.server";
import {
  applyRiskReviewDecisionInTransaction,
  validateRiskReviewTargetInTransaction,
} from "@/server/workflows/decide-risk-review.server";
import { syncQuoteApprovalDecisionInTransaction } from "./quote-lifecycle.server";
import { createMessageHandoffInTransaction } from "./message-handoff.server";

export type ApprovalDecisionCommandInput = ApprovalDecisionWrite & {
  idempotencyKey: string;
};

/** Receipt, locked approval, agent-run release and audit share one transaction. */
export async function decideApprovalCommand(
  context: RequestAuthorization,
  input: ApprovalDecisionCommandInput,
): Promise<HumanApproval> {
  return transaction(async (db) => {
    const claim = await claimCommandReceipt<HumanApproval>(db, {
      scope: "approval.decision",
      actorId: context.actor.profileId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        id: input.id,
        decision: input.decision,
        notes: input.notes ?? null,
        expectedVersion: input.expectedVersion ?? null,
      },
    });
    if (claim.kind === "replay") return claim.result;
    const approval = await decideApprovalInTransaction(db, context, input, async (current) => {
      if (input.decision !== "escalated") {
        await validateRiskReviewTargetInTransaction(current, context, db);
      }
    });
    await syncQuoteApprovalDecisionInTransaction(db, context, approval);
    await applyRiskReviewDecisionInTransaction(approval, context, db);
    await createMessageHandoffInTransaction(db, approval);
    await completeCommandReceipt(db, claim.id, approval);
    return approval;
  });
}
