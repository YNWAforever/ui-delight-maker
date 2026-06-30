import { createFileRoute } from "@tanstack/react-router";
import type { QuoteDraftWritebackPayload } from "@/lib/workflows/types";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import { writeQuoteDraftResult } from "@/server/workflows/writebacks";

export const Route = createFileRoute("/api/workflows/draft-quote")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = (await request.json()) as QuoteDraftWritebackPayload;
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
