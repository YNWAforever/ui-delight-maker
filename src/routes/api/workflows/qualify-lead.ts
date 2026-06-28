import { createFileRoute } from "@tanstack/react-router";
import type { QualificationWritebackPayload } from "@/lib/workflows/types";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import { writeQualificationResult } from "@/server/workflows/writebacks";

export const Route = createFileRoute("/api/workflows/qualify-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = (await request.json()) as QualificationWritebackPayload;

        await writeQualificationResult(payload);

        return Response.json({ ok: true });
      },
    },
  },
});
