import { z } from "zod";

export type AIExecutionProvenance = {
  source: "provider" | "deterministic_fallback" | "unknown";
  providerRequestId: string | null;
  workerExecutionId: string | null;
  workerVersion: string | null;
  requestedModel: string | null;
  actualModel: string | null;
  fallbackReason: string | null;
};
const label = z.string().trim().min(1).max(256).nullable().optional();
export const aiExecutionProvenanceSchema = z
  .object({
    source: z.enum(["provider", "deterministic_fallback", "unknown"]).default("unknown"),
    providerRequestId: label,
    workerExecutionId: label,
    workerVersion: label,
    requestedModel: label,
    actualModel: label,
    fallbackReason: z.string().trim().min(1).max(512).nullable().optional(),
  })
  .transform(
    (value): AIExecutionProvenance => ({
      source: value.source,
      providerRequestId: value.providerRequestId ?? null,
      workerExecutionId: value.workerExecutionId ?? null,
      workerVersion: value.workerVersion ?? null,
      requestedModel: value.requestedModel ?? null,
      actualModel: value.actualModel ?? null,
      fallbackReason: value.fallbackReason ?? null,
    }),
  );

/** Nullable legacy storage becomes unknown, never an inferred provider execution. */
export function normalizeAIExecutionProvenance(value: unknown): AIExecutionProvenance {
  return aiExecutionProvenanceSchema.parse(value ?? {});
}

/** Transport fields are optional on the wire; absent numeric facts stay absent. */
export const providerUsageSchema = z.object({
  inputTokens: z.number().finite().nonnegative().optional(),
  outputTokens: z.number().finite().nonnegative().optional(),
  totalTokens: z.number().finite().nonnegative().optional(),
  cost: z.number().finite().nonnegative().optional(),
  currency: z.string().trim().min(1).max(16).optional(),
  source: z.string().trim().min(1).max(80),
});

export const callbackProvenanceFields = {
  execution_metadata: aiExecutionProvenanceSchema.optional(),
  attempt_id: z.string().trim().min(1).optional(),
  tokens_used: z.number().finite().nonnegative().optional(),
  usage: providerUsageSchema.optional(),
  model_used: z.string().trim().min(1).max(256).optional(),
};
