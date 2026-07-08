import { createFileRoute } from "@tanstack/react-router";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import { getAccountWorkflowContext } from "@/server/workflows/context-account.server";
import {
  getAccountWorkflowContextErrorResponse,
  readAccountWorkflowContextRequestPayload,
} from "@/server/workflows/context-route.server";

export const Route = createFileRoute("/api/workflows/context/account")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = await readAccountWorkflowContextRequestPayload(request);

        if (payload instanceof Response) {
          return payload;
        }

        try {
          const context = await getAccountWorkflowContext({
            accountId: payload.account_id,
            agentRunId: payload.agent_run_id,
          });

          return Response.json(context);
        } catch (error) {
          const response = getAccountWorkflowContextErrorResponse(error);
          if (response) {
            return response;
          }

          throw error;
        }
      },
    },
  },
});
