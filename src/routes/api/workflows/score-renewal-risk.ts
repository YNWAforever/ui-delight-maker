import { createFileRoute } from "@tanstack/react-router";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import {
  readWritebackPayload,
  scoreRenewalRiskWritebackSchema,
} from "@/server/workflows/writeback-payloads.server";
import {
  writeScoreRenewalRiskResult,
  handleAIWriteback,
  recordInvalidWriteback,
} from "@/server/workflows/writebacks";

export const Route = createFileRoute("/api/workflows/score-renewal-risk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        return handleAIWriteback(async () => {
          const payload = await readWritebackPayload(
            request,
            scoreRenewalRiskWritebackSchema,
            (body, error) => recordInvalidWriteback(body, "score_renewal_risk", error),
          );
          if (payload instanceof Response) return payload;

          await writeScoreRenewalRiskResult(payload);

          return Response.json({ ok: true });
        });
      },
    },
  },
});
