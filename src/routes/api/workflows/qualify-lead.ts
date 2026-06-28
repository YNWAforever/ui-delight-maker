import { createFileRoute } from "@tanstack/react-router";
import type { QualificationData } from "@/lib/types";
import type { QualificationWritebackPayload } from "@/lib/workflows/types";
import { createActivityLog } from "@/server/repositories/activity-logs";
import { updateAgentRunResult } from "@/server/repositories/agent-runs";
import { updateLead } from "@/server/repositories/leads";

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

function getHumanReviewRequired(
  qualificationData: unknown,
  confidenceScore: number,
) {
  if (
    qualificationData &&
    typeof qualificationData === "object" &&
    "human_review_required" in qualificationData
  ) {
    return Boolean(
      (qualificationData as { human_review_required?: unknown }).human_review_required,
    );
  }

  return confidenceScore < 0.7;
}

export const Route = createFileRoute("/api/workflows/qualify-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = (await request.json()) as QualificationWritebackPayload;

        await updateLead(payload.lead_id, {
          lead_score: payload.lead_score,
          qualification_data: payload.qualification_data as QualificationData,
        });

        await updateAgentRunResult(payload.agent_run_id, {
          status: "completed",
          output_data: payload.qualification_data,
          output_summary: payload.output_summary,
          confidence_score: payload.confidence_score,
          human_review_required: getHumanReviewRequired(
            payload.qualification_data,
            payload.confidence_score,
          ),
          duration_ms: payload.duration_ms ?? null,
          tokens_used: payload.tokens_used ?? null,
          model_used: payload.model_used ?? null,
        });

        await createActivityLog({
          actor_type: "agent",
          actor_id: payload.agent_run_id,
          actor_name: "Lead Qualification Agent",
          action: "qualified lead",
          object_type: "lead",
          object_id: payload.lead_id,
          diff_data: {
            lead_score: payload.lead_score,
            qualification_data: payload.qualification_data,
          },
        });

        return Response.json({ ok: true });
      },
    },
  },
});
