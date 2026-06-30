import { createFileRoute } from "@tanstack/react-router";
import type { WorkflowContextRequestPayload } from "@/lib/workflows/types";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import { getLeadWorkflowContext } from "@/server/workflows/context.server";

export const Route = createFileRoute("/api/workflows/context/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = (await request.json()) as WorkflowContextRequestPayload;

        if (!payload.lead_id || !payload.agent_run_id) {
          return new Response("Missing lead_id or agent_run_id", { status: 400 });
        }

        const context = await getLeadWorkflowContext({
          leadId: payload.lead_id,
          agentRunId: payload.agent_run_id,
        });

        return Response.json(context);
      },
    },
  },
});
