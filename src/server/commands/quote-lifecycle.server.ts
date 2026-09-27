import type { HumanApproval } from "@/lib/types";
import { OperationError } from "@/lib/operations/errors";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { transaction } from "@/server/db/neon.server";
import { createApproval, findPendingApprovalForQuote } from "@/server/repositories/approvals";
import { updateQuoteLifecycle } from "@/server/repositories/quotes";
import { lockQuoteAndAuthorize } from "./quote-revision.server";

export type RequestQuoteApprovalInput = {
  id: string;
  assignedTo?: string | null;
};

/** Quote row, open approval, notifications and lifecycle state commit together. */
export async function requestQuoteApprovalCommand(
  context: RequestAuthorization,
  input: RequestQuoteApprovalInput,
): Promise<HumanApproval> {
  return transaction(async (db) => {
    const quote = await lockQuoteAndAuthorize(db, context, input.id, ["quotes.request_approval"]);
    const existing = await findPendingApprovalForQuote(input.id, db);
    if (existing) {
      if (quote.status !== "pending_approval") {
        throw new OperationError("INVALID_STATE", "Open approval and quote state disagree");
      }
      return existing;
    }
    if (quote.status !== "draft" && quote.status !== "revised") {
      throw new OperationError("INVALID_STATE", "Quote is not ready for approval request");
    }

    if (input.assignedTo) {
      const assignee = (
        await db.query<{ id: string }>("select id from profiles where id=$1 and status='active'", [
          input.assignedTo,
        ])
      ).rows[0];
      if (!assignee) throw new OperationError("INVALID_INPUT", "Approval assignee is unavailable");
    }
    const approval = await createApproval(
      {
        approval_type: "quote_send",
        requested_by: context.actor.profileId,
        assigned_to: input.assignedTo ?? null,
        context_summary: `Quote ${quote.number ?? quote.id} for approval`,
        context_data: {
          quote_id: quote.id,
          quote_number: quote.number,
          total_value: quote.total_value,
          currency: quote.currency,
        },
      },
      db,
    );
    await updateQuoteLifecycle(quote.id, { status: "pending_approval" }, db);
    return approval;
  });
}
