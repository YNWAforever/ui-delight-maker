import { createFileRoute } from "@tanstack/react-router";
import type { ReplyDraftWritebackPayload } from "@/lib/workflows/types";
import { createActivityLog } from "@/server/repositories/activity-logs";
import { createApproval } from "@/server/repositories/approvals";
import { updateAgentRunResult } from "@/server/repositories/agent-runs";
import { getLeadWithActivity } from "@/server/repositories/leads";

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

export const Route = createFileRoute("/api/workflows/draft-reply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = (await request.json()) as ReplyDraftWritebackPayload;

        await getLeadWithActivity(payload.lead_id);

        const approval = await createApproval({
          agent_run_id: payload.agent_run_id,
          approval_type: "message_send",
          requested_by: "Reply Draft Agent",
          context_data: {
            lead_id: payload.lead_id,
            draft_message: payload.draft_message,
            confidence_score: payload.confidence_score,
            risk_notes: payload.risk_notes ?? [],
          },
          context_summary: payload.context_summary,
        });

        await updateAgentRunResult(payload.agent_run_id, {
          status: "waiting_approval",
          output_data: {
            approval_id: approval.id,
            draft_message: payload.draft_message,
            risk_notes: payload.risk_notes ?? [],
          },
          output_summary: payload.context_summary,
          confidence_score: payload.confidence_score,
          human_review_required: true,
        });

        await createActivityLog({
          actor_type: "agent",
          actor_id: payload.agent_run_id,
          actor_name: "Reply Draft Agent",
          action: "drafted reply for review",
          object_type: "lead",
          object_id: payload.lead_id,
          diff_data: { approval_id: approval.id },
        });

        return Response.json({ ok: true, approval_id: approval.id });
      },
    },
  },
});
