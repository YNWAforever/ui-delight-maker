import { createFileRoute } from "@tanstack/react-router";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import {
  qualificationWritebackSchema,
  readWritebackPayload,
} from "@/server/workflows/writeback-payloads.server";
import {
  writeQualificationResult,
  handleAIWriteback,
  recordInvalidWriteback,
} from "@/server/workflows/writebacks";

export const Route = createFileRoute("/api/workflows/qualify-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        return handleAIWriteback(async () => {
          const payload = await readWritebackPayload(
            request,
            qualificationWritebackSchema,
            (body, error) => recordInvalidWriteback(body, "qualify_lead", error),
          );
          if (payload instanceof Response) return payload;

          await writeQualificationResult(payload);

          return Response.json({ ok: true });
        });
      },
    },
  },
});
