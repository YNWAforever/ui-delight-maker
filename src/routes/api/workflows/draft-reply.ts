import { createFileRoute } from "@tanstack/react-router";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import {
  readWritebackPayload,
  replyDraftWritebackSchema,
} from "@/server/workflows/writeback-payloads.server";
import {
  writeReplyDraftResult,
  handleAIWriteback,
  recordInvalidWriteback,
} from "@/server/workflows/writebacks";

export const Route = createFileRoute("/api/workflows/draft-reply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertWorkflowToken(request);
        return handleAIWriteback(async () => {
          const payload = await readWritebackPayload(
            request,
            replyDraftWritebackSchema,
            (body, error) => recordInvalidWriteback(body, "draft_reply", error),
          );
          if (payload instanceof Response) return payload;

          const approvalId = await writeReplyDraftResult(payload);

          return Response.json({ ok: true, approval_id: approvalId });
        });
      },
    },
  },
});
