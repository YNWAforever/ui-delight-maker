import { z } from "zod";

export const governedWorkflowSchema = z.enum([
  "qualify_lead",
  "draft_reply",
  "draft_quote",
  "score_renewal_risk",
  "relationship_intelligence",
]);
const common = {
  workflowType: governedWorkflowSchema,
  reason: z.string().trim().min(10).max(1000),
  expectedVersionId: z.string().uuid().nullable(),
};
// Unknown client fields (including humanApproval) are stripped, never applied.
export const agentPolicyChangeSchema = z.object({
  ...common,
  status: z.enum(["active", "inactive"]),
});
export const agentPolicyRollbackSchema = z.object({ ...common, versionId: z.string().uuid() });
export const agentPolicyHistorySchema = z.object({
  workflowType: governedWorkflowSchema,
  limit: z.number().int().min(1).max(25).default(25),
  cursor: z
    .string()
    .min(1)
    .max(1024)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});
export const agentPolicyCursorSchema = z
  .object({
    workflowType: governedWorkflowSchema,
    createdAt: z.string().datetime(),
    versionSeq: z.string().regex(/^[1-9][0-9]*$/),
  })
  .strict();
export type AgentPolicyChangeInput = z.infer<typeof agentPolicyChangeSchema>;
export type AgentPolicyRollbackInput = z.infer<typeof agentPolicyRollbackSchema>;
export type AgentPolicyHistoryInput = z.infer<typeof agentPolicyHistorySchema>;
