import type { QualificationData, QualificationNextAction } from "@/lib/types";

/**
 * Makes legacy stored qualification data renderable. New writebacks pass strict output
 * contracts before reaching this helper; malformed provider output is rejected atomically.
 *
 * `qualification_data` is free-form model output relayed by n8n. The workflow's Resolve Output
 * node takes `parsed.qualification_data` whole whenever it is a plain object — `safeJsonValue`
 * bounds its depth and size but checks no field — and the writeback then cast it to
 * `QualificationData` and stored it. So `{"notes": "looks good"}` was a valid qualification as
 * far as every layer was concerned, and the lead Insights tab, which reads
 * `qualification_data.service_interest.map(...)`, threw and took the whole page down.
 *
 * This legacy read compatibility does not validate or authorize new model output.
 */

const NEXT_ACTIONS: readonly QualificationNextAction[] = [
  "Schedule discovery call",
  "Send intro deck",
  "Request more info",
  "Disqualify",
];

function clampedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function textOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export function normalizeQualificationData(value: unknown): QualificationData {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;

  return {
    urgency_score: clampedNumber(raw.urgency_score, 0, 10, 0),
    fit_score: clampedNumber(raw.fit_score, 0, 10, 0),
    qualification_score: clampedNumber(raw.qualification_score, 0, 100, 0),
    service_interest: Array.isArray(raw.service_interest)
      ? raw.service_interest.filter((entry): entry is string => typeof entry === "string")
      : [],
    budget_range: textOr(raw.budget_range, "unknown"),
    next_action: NEXT_ACTIONS.includes(raw.next_action as QualificationNextAction)
      ? (raw.next_action as QualificationNextAction)
      : "Request more info",
    reason: textOr(raw.reason, ""),
    confidence: clampedNumber(raw.confidence, 0, 1, 0),
    /**
     * Defaults to true, unlike every other field.
     *
     * The others degrade to something harmless when the model omits them; this one decides
     * whether a person looks at the result. Not knowing has to mean "someone should", or a
     * malformed payload would quietly clear the review flag — the same direction of failure as
     * a model asserting `human_review_required: false` outright, which the writeback also
     * refuses to honour below the confidence floor.
     */
    human_review_required:
      typeof raw.human_review_required === "boolean" ? raw.human_review_required : true,
  };
}
