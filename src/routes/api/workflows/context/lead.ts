import { createFileRoute } from "@tanstack/react-router";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import {
  getWorkflowContextErrorResponse,
  readWorkflowContextRequestPayload,
} from "@/server/workflows/context-route.server";
import { getLeadWorkflowContext } from "@/server/workflows/context.server";

export const Route = createFileRoute("/api/workflows/context/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = await readWorkflowContextRequestPayload(request);

        if (payload instanceof Response) {
          return payload;
        }

        try {
          const context = await getLeadWorkflowContext({
            leadId: payload.lead_id,
            agentRunId: payload.agent_run_id,
          });

          return Response.json(context);
        } catch (error) {
          const response = getWorkflowContextErrorResponse(error);
          if (response) {
            return response;
          }

          throw error;
        }
      },
    },
  },
});
