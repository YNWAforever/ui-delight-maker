import { createFileRoute } from "@tanstack/react-router";
import type { RelationshipIntelligenceWritebackPayload } from "@/lib/workflows/types";
import {
  readWritebackPayload,
  relationshipIntelligenceWritebackSchema,
} from "@/server/workflows/writeback-payloads.server";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import { writeRelationshipIntelligenceResult } from "@/server/workflows/writebacks";

export function parseRelationshipIntelligenceWritebackPayload(
  payload: unknown,
): RelationshipIntelligenceWritebackPayload | null {
  const result = relationshipIntelligenceWritebackSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export const Route = createFileRoute("/api/workflows/relationship-intelligence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = await readWritebackPayload(
          request,
          relationshipIntelligenceWritebackSchema,
        );
        if (payload instanceof Response) {
          return Response.json(
            { ok: false, error: "Malformed relationship intelligence payload" },
            { status: payload.status },
          );
        }

        await writeRelationshipIntelligenceResult(payload);

        return Response.json({ ok: true });
      },
    },
  },
});
