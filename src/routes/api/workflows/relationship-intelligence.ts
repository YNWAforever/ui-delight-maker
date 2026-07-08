import { createFileRoute } from "@tanstack/react-router";
import type { RelationshipIntelligenceWritebackPayload } from "@/lib/workflows/types";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import { writeRelationshipIntelligenceResult } from "@/server/workflows/writebacks";

function isSignal(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const signal = value as Record<string, unknown>;
  return (
    typeof signal.signal_type === "string" &&
    typeof signal.severity === "string" &&
    typeof signal.title === "string" &&
    typeof signal.reason === "string" &&
    (signal.suggested_action === null || typeof signal.suggested_action === "string") &&
    typeof signal.dedupe_key === "string"
  );
}

export function parseRelationshipIntelligenceWritebackPayload(
  payload: unknown,
): RelationshipIntelligenceWritebackPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  if (
    typeof candidate.account_id !== "string" ||
    typeof candidate.agent_run_id !== "string" ||
    typeof candidate.output_summary !== "string" ||
    (candidate.next_action !== null && typeof candidate.next_action !== "string") ||
    !Array.isArray(candidate.signals) ||
    !candidate.signals.every(isSignal) ||
    typeof candidate.confidence_score !== "number" ||
    (candidate.model_used !== undefined && typeof candidate.model_used !== "string")
  ) {
    return null;
  }

  return candidate as RelationshipIntelligenceWritebackPayload;
}

export const Route = createFileRoute("/api/workflows/relationship-intelligence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        let rawPayload: unknown;
        try {
          rawPayload = await request.json();
        } catch {
          return Response.json(
            { ok: false, error: "Malformed relationship intelligence payload" },
            { status: 400 },
          );
        }

        const payload = parseRelationshipIntelligenceWritebackPayload(rawPayload);
        if (!payload) {
          return Response.json(
            { ok: false, error: "Malformed relationship intelligence payload" },
            { status: 400 },
          );
        }

        await writeRelationshipIntelligenceResult(payload);

        return Response.json({ ok: true });
      },
    },
  },
});
