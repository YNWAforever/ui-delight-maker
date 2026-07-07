import { createFileRoute } from "@tanstack/react-router";
import type { RelationshipIntelligenceWritebackPayload } from "@/lib/workflows/types";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import { writeRelationshipIntelligenceResult } from "@/server/workflows/writebacks";

export const Route = createFileRoute("/api/workflows/relationship-intelligence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = (await request.json()) as RelationshipIntelligenceWritebackPayload;

        await writeRelationshipIntelligenceResult(payload);

        return Response.json({ ok: true });
      },
    },
  },
});
