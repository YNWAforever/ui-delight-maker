import { createFileRoute } from "@tanstack/react-router";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import {
  getEngagementWorkflowContextErrorResponse,
  readEngagementWorkflowContextRequestPayload,
} from "@/server/workflows/context-route.server";
import { getEngagementWorkflowContext } from "@/server/workflows/context-engagement.server";

export const Route = createFileRoute("/api/workflows/context/engagement")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = await readEngagementWorkflowContextRequestPayload(request);

        if (payload instanceof Response) {
          return payload;
        }

        try {
          const context = await getEngagementWorkflowContext({
            engagementId: payload.engagement_id,
            agentRunId: payload.agent_run_id,
          });

          return Response.json(context);
        } catch (error) {
          const response = getEngagementWorkflowContextErrorResponse(error);
          if (response) {
            return response;
          }

          throw error;
        }
      },
    },
  },
});
