import { z } from "zod";
import { governedWorkflowSchema } from "./agent-policy-input";
export const agentQueueSchema = z
  .object({
    queue: z.enum(["runs", "approvals"]),
    workflowType: z.union([governedWorkflowSchema, z.literal("unknown")]).optional(),
    status: z.string().max(32).optional(),
    attention: z.boolean().default(false),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    origin: z.enum(["all", "demo", "non-demo", "unknown"]).default("all"),
    runId: z.string().uuid().optional(),
    cursor: z
      .string()
      .max(4096)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    limit: z.union([z.literal(25), z.literal(50)]).default(25),
  })
  .superRefine((input, ctx) => {
    const statuses =
      input.queue === "runs"
        ? ["running", "completed", "failed", "waiting_approval"]
        : ["pending", "escalated", "approved", "rejected", "superseded"];
    if (input.status !== undefined && !statuses.includes(input.status))
      ctx.addIssue({ code: "custom", path: ["status"], message: "Invalid queue status" });
    if (input.from && input.to && Date.parse(input.from) > Date.parse(input.to))
      ctx.addIssue({ code: "custom", path: ["from"], message: "Invalid date range" });
  });
export type AgentQueueQuery = z.input<typeof agentQueueSchema>;
// URL parsing is forgiving; the BFF uses the strict schema above.
export const agentQueueSearchSchema = z.object({
  workflowType: z
    .union([governedWorkflowSchema, z.literal("unknown")])
    .optional()
    .catch(undefined),
  status: z
    .enum([
      "running",
      "completed",
      "failed",
      "waiting_approval",
      "pending",
      "escalated",
      "approved",
      "rejected",
      "superseded",
    ])
    .optional()
    .catch(undefined),
  attention: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
  from: z.string().datetime().optional().catch(undefined),
  to: z.string().datetime().optional().catch(undefined),
  origin: z.enum(["all", "demo", "non-demo", "unknown"]).default("all").catch("all"),
  cursor: z.string().max(4096).optional().catch(undefined),
  limit: z.coerce
    .number()
    .pipe(z.union([z.literal(25), z.literal(50)]))
    .default(25)
    .catch(25),
  runId: z.string().uuid().optional().catch(undefined),
});
