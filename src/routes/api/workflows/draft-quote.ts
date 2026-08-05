import { createFileRoute } from "@tanstack/react-router";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import {
  quoteDraftWritebackSchema,
  readWritebackPayload,
} from "@/server/workflows/writeback-payloads.server";
import { writeQuoteDraftResult } from "@/server/workflows/writebacks";

export const Route = createFileRoute("/api/workflows/draft-quote")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = await readWritebackPayload(request, quoteDraftWritebackSchema);
        if (payload instanceof Response) return payload;

        const result = await writeQuoteDraftResult(payload);

        return Response.json({
          ok: true,
          quote_id: result.quoteId,
          approval_id: result.approvalId,
        });
      },
    },
  },
});
