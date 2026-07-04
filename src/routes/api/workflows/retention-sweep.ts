import { createFileRoute } from "@tanstack/react-router";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import { runRetentionSweep } from "@/server/workflows/retention-sweep.server";

export const Route = createFileRoute("/api/workflows/retention-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const today = new Date().toISOString().slice(0, 10);
        const result = await runRetentionSweep(today);
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
