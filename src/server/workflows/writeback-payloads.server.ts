import { z } from "zod";
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
  lead_id: id,
  agent_run_id: id,
  qualification_data: z.unknown(),
  lead_score: z.number().finite(),
  output_summary: z.string(),
  confidence_score: z.number().finite(),
  duration_ms: z.number().finite().optional(),
  tokens_used: z.number().finite().optional(),
  model_used: z.string().optional(),
});

export const replyDraftWritebackSchema = z.object({
  lead_id: id,
  agent_run_id: id,
  draft_message: z.string(),
  context_summary: z.string(),
  confidence_score: z.number().finite(),
  risk_notes: z.array(z.string()).optional(),
});

export const quoteDraftWritebackSchema = z.object({
  lead_id: id,
  agent_run_id: id,
  quote: z.object({
    number: z.string().nullable().optional(),
    currency: z.string().trim().min(1),
    total_value: z.number().finite(),
    valid_until: z.string().nullable().optional(),
    line_items: z.array(
      z.object({
        id: z.string(),
        service: z.string(),
        description: z.string(),
        qty: z.number().finite(),
        unit_price: z.number().finite(),
      }),
    ),
  }),
  create_send_approval: z.boolean(),
  context_summary: z.string().nullable().optional(),
  confidence_score: z.number().finite(),
});

export const scoreRenewalRiskWritebackSchema = z.object({
  engagement_id: id,
  agent_run_id: id,
  health_score: z.number().finite(),
  renewal_risk: z.enum(["low", "medium", "high"]),
  risk_reasoning: z.string(),
  suggested_next_action: z.string(),
  confidence: z.number().finite(),
  output_summary: z.string(),
  model_used: z.string().optional(),
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
): Promise<T | Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return new Response("Request body is not valid JSON", { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return new Response(`Invalid writeback payload — ${detail}`, { status: 400 });
  }

  return parsed.data;
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
