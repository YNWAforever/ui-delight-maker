import { createFileRoute } from "@tanstack/react-router";
import type { ScoreRenewalRiskWritebackPayload } from "@/lib/workflows/types";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import { writeScoreRenewalRiskResult } from "@/server/workflows/writebacks";

export const Route = createFileRoute("/api/workflows/score-renewal-risk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = (await request.json()) as ScoreRenewalRiskWritebackPayload;

        await writeScoreRenewalRiskResult(payload);

        return Response.json({ ok: true });
      },
    },
  },
});
