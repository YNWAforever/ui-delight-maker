import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireCapability } from "@/server/auth/authorization.server";
import { parseOperationInput } from "@/lib/operations/errors";
import { loadNoteTidyRuns } from "@/server/read-models/note-tidy-runs";
const noteHistorySchema = z.object({
  page: z.number().int().min(1).max(100000).default(1),
  limit: z.literal(25).default(25),
  runId: z.string().uuid().optional(),
});
export const getNoteTidyRuns = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(noteHistorySchema, data))
  .handler(async ({ data }) => {
    const session = await requireCapability("agents.view");
    return loadNoteTidyRuns(session.profile.id, parseOperationInput(noteHistorySchema, data));
  });
