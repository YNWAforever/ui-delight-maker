import { createFileRoute } from "@tanstack/react-router";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import {
  readWritebackPayload,
  scoreRenewalRiskWritebackSchema,
} from "@/server/workflows/writeback-payloads.server";
import { writeScoreRenewalRiskResult } from "@/server/workflows/writebacks";

export const Route = createFileRoute("/api/workflows/score-renewal-risk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = await readWritebackPayload(request, scoreRenewalRiskWritebackSchema);
        if (payload instanceof Response) return payload;

        await writeScoreRenewalRiskResult(payload);

        return Response.json({ ok: true });
      },
    },
  },
});
