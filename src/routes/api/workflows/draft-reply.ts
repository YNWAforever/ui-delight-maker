import { createFileRoute } from "@tanstack/react-router";
import type { ReplyDraftWritebackPayload } from "@/lib/workflows/types";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import { writeReplyDraftResult } from "@/server/workflows/writebacks";

export const Route = createFileRoute("/api/workflows/draft-reply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = (await request.json()) as ReplyDraftWritebackPayload;
        const approvalId = await writeReplyDraftResult(payload);

        return Response.json({ ok: true, approval_id: approvalId });
      },
    },
  },
});
