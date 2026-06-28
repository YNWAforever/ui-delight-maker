import { createFileRoute } from "@tanstack/react-router";
import type { QuoteDraftWritebackPayload } from "@/lib/workflows/types";
import { createActivityLog } from "@/server/repositories/activity-logs";
import { createApproval } from "@/server/repositories/approvals";
import { updateAgentRunResult } from "@/server/repositories/agent-runs";
import { getLeadWithActivity } from "@/server/repositories/leads";
import { createQuote } from "@/server/repositories/quotes";

function assertWorkflowToken(request: Request) {
  const expected = process.env.N8N_WORKFLOW_TOKEN;

  if (!expected) {
    throw new Response("Workflow token is not configured", { status: 500 });
  }

  const actual = request.headers.get("x-workflow-token");

  if (actual !== expected) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

export const Route = createFileRoute("/api/workflows/draft-quote")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = (await request.json()) as QuoteDraftWritebackPayload;

        await getLeadWithActivity(payload.lead_id);

        const quote = await createQuote({
          lead_id: payload.lead_id,
          number: payload.quote.number ?? null,
          currency: payload.quote.currency,
          total_value: payload.quote.total_value,
          valid_until: payload.quote.valid_until ?? null,
          line_items: payload.quote.line_items,
        });

        const approval = payload.create_send_approval
          ? await createApproval({
              agent_run_id: payload.agent_run_id,
              approval_type: "quote_send",
              requested_by: "Quote Draft Agent",
              context_data: {
                lead_id: payload.lead_id,
                quote_id: quote.id,
                confidence_score: payload.confidence_score,
              },
              context_summary:
                payload.context_summary ?? "Review drafted quote before sending.",
            })
          : null;

        await updateAgentRunResult(payload.agent_run_id, {
          status: approval ? "waiting_approval" : "completed",
          output_data: {
            quote_id: quote.id,
            approval_id: approval?.id ?? null,
          },
          output_summary: payload.context_summary ?? "Draft quote created.",
          confidence_score: payload.confidence_score,
          human_review_required: Boolean(approval),
        });

        await createActivityLog({
          actor_type: "agent",
          actor_id: payload.agent_run_id,
          actor_name: "Quote Draft Agent",
          action: "created draft quote",
          object_type: "quote",
          object_id: quote.id,
          diff_data: { lead_id: payload.lead_id, approval_id: approval?.id ?? null },
        });

        return Response.json({
          ok: true,
          quote_id: quote.id,
          approval_id: approval?.id ?? null,
        });
      },
    },
  },
});
