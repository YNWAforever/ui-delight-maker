import { createFileRoute } from "@tanstack/react-router";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import {
  readWritebackPayload,
  replyDraftWritebackSchema,
} from "@/server/workflows/writeback-payloads.server";
import { writeReplyDraftResult } from "@/server/workflows/writebacks";

export const Route = createFileRoute("/api/workflows/draft-reply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        const payload = await readWritebackPayload(request, replyDraftWritebackSchema);
        if (payload instanceof Response) return payload;

        const approvalId = await writeReplyDraftResult(payload);

        return Response.json({ ok: true, approval_id: approvalId });
      },
    },
  },
});
