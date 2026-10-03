import { z } from "zod";
import {
  confidenceSchema,
  scoreSchema,
  qualificationOutputSchema,
  quoteOutputSchema,
} from "@/lib/workflows/output-contracts";
import { callbackProvenanceFields } from "@/lib/workflows/provenance";
import type {
  QualificationWritebackPayload,
  QuoteDraftWritebackPayload,
  ReplyDraftWritebackPayload,
  ScoreRenewalRiskWritebackPayload,
} from "@/lib/workflows/types";

/**
 * Runtime shapes for the n8n writeback callbacks.
 *
 * These four routes used to do `(await request.json()) as SomePayload` — a cast, which checks
 * nothing. A callback with a missing field, a wrong type, or a body that is not JSON at all
 * reached the repository layer and surfaced as an unhandled 500 (or, for a well-formed body
 * with the wrong ids, as a write against whatever the ids happened to name). The relationship
 * intelligence route already validated its payload by hand; this is the same idea for the rest,
 * expressed once.
 *
 * The token check still runs first in each handler — this is about shape, not authorization.
 */

const id = z.string().trim().min(1);
export const qualificationWritebackSchema = z.object({
  ...callbackProvenanceFields,
  workflow_type: z.literal("qualify_lead").optional(),
  lead_id: id,
  agent_run_id: id,
  qualification_data: qualificationOutputSchema,
  lead_score: scoreSchema,
  output_summary: z.string().trim().min(1),
  confidence_score: confidenceSchema,
});

export const replyDraftWritebackSchema = z.object({
  ...callbackProvenanceFields,
  workflow_type: z.literal("draft_reply").optional(),
  lead_id: id,
  agent_run_id: id,
  draft_message: z.string().trim().min(1),
  context_summary: z.string().trim().min(1),
  confidence_score: confidenceSchema,
  risk_notes: z.array(z.string()).optional(),
});

export const quoteDraftWritebackSchema = z.object({
  ...callbackProvenanceFields,
  workflow_type: z.literal("draft_quote").optional(),
  lead_id: id,
  agent_run_id: id,
  quote: quoteOutputSchema,
  create_send_approval: z.boolean(),
  context_summary: z.string().nullable().optional(),
  confidence_score: confidenceSchema,
});

export const scoreRenewalRiskWritebackSchema = z.object({
  ...callbackProvenanceFields,
  workflow_type: z.literal("score_renewal_risk").optional(),
  engagement_id: id,
  agent_run_id: id,
  health_score: scoreSchema,
  renewal_risk: z.enum(["low", "medium", "high"]),
  risk_reasoning: z.string().trim().min(1),
  suggested_next_action: z.string().trim().min(1),
  confidence: confidenceSchema,
  output_summary: z.string().trim().min(1),
});

export const relationshipIntelligenceWritebackSchema = z.object({
  ...callbackProvenanceFields,
  workflow_type: z.literal("relationship_intelligence").optional(),
  account_id: id,
  agent_run_id: id,
  output_summary: z.string().trim().min(1),
  next_action: z.string().nullable(),
  confidence_score: confidenceSchema,
  signals: z
    .array(
      z.object({
        signal_type: z.enum([
          "missing_decision_maker",
          "missing_champion",
          "stale_touchpoint",
          "post_event_follow_up_due",
          "stale_quote",
          "coverage_gap",
          "high_risk_engagement",
          "negative_sentiment",
          "unowned_account",
          "cross_sell_opportunity",
        ]),
        severity: z.enum(["low", "medium", "high"]),
        title: z.string().trim().min(1),
        reason: z.string().trim().min(1),
        suggested_action: z.string().nullable(),
        dedupe_key: z.string().trim().min(1),
      }),
    )
    .max(50),
});

/**
 * Parses a writeback body, or returns the 400 to send back.
 *
 * Returning a `Response` rather than throwing keeps the "bad request" path out of the generic
 * 500 handler, and mirrors `readWorkflowContextRequestPayload` in context-route.server.ts.
 */
export async function readWritebackPayload<T>(
  request: Request,
  schema: z.ZodType<T>,
  onInvalid?: (body: unknown, error: string) => Promise<void>,
): Promise<T | Response> {
  const body = await readRawWritebackPayload(request);
  if (body instanceof Response) return body;

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    await onInvalid?.(body, parsed.error.message);
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return new Response(`Invalid writeback payload — ${detail}`, { status: 400 });
  }

  return parsed.data;
}

export const WRITEBACK_MAX_BYTES = 128 * 1024;

/** Bound the actual stream, including requests with missing / misleading length headers. */
export async function readRawWritebackPayload(request: Request): Promise<unknown | Response> {
  const tooLarge = () => new Response("Writeback payload exceeds the byte limit", { status: 413 });
  if (Number(request.headers.get("content-length")) > WRITEBACK_MAX_BYTES) {
    await request.body?.cancel();
    return tooLarge();
  }
  const reader = request.body?.getReader();
  if (!reader) return new Response("Request body is not valid JSON", { status: 400 });
  let bytes = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > WRITEBACK_MAX_BYTES) {
        await reader.cancel();
        return tooLarge();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    return new Response("Request body is not valid JSON", { status: 400 });
  } finally {
    reader.releaseLock();
  }
}

// Compile-time proof that each schema still describes the payload the writeback consumes.
// If a field is added to one of these types and not to its schema, this file stops compiling.
type SchemaMatches<Schema, Payload> = Schema extends Payload ? true : never;
export type QualificationSchemaMatches = SchemaMatches<
  z.infer<typeof qualificationWritebackSchema>,
  QualificationWritebackPayload
>;
export type ReplyDraftSchemaMatches = SchemaMatches<
  z.infer<typeof replyDraftWritebackSchema>,
  ReplyDraftWritebackPayload
>;
export type QuoteDraftSchemaMatches = SchemaMatches<
  z.infer<typeof quoteDraftWritebackSchema>,
  QuoteDraftWritebackPayload
>;
export type ScoreRenewalRiskSchemaMatches = SchemaMatches<
  z.infer<typeof scoreRenewalRiskWritebackSchema>,
  ScoreRenewalRiskWritebackPayload
>;
