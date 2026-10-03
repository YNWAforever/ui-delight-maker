import { describe, expect, it } from "vitest";
import {
  quoteDraftWritebackSchema,
  qualificationWritebackSchema,
  replyDraftWritebackSchema,
  scoreRenewalRiskWritebackSchema,
  relationshipIntelligenceWritebackSchema,
} from "@/server/workflows/writeback-payloads.server";
import { buildQualificationFallback, buildQuoteDraftFallback } from "../fallbacks";
import { validQualification } from "./commercial-fixtures";

const line = { id: "one", service: "Synthetic", description: "Synthetic", qty: 2, unit_price: 100 };
const quotePayload = {
  lead_id: "lead",
  agent_run_id: "run",
  quote: { currency: "HKD", total_value: 200, line_items: [line], valid_until: "2026-10-31" },
  create_send_approval: true,
  confidence_score: 0.8,
};
const context = {
  lead: {
    id: "lead",
    company_name: "Synthetic",
    contact_name: null,
    contact_email: null,
    qualification_data: null,
    enquiry_text: "budget HKD 1000",
  },
  pricing_templates: [],
};

describe("AI commercial callback contracts", () => {
  it("rejects_inconsistent_quote_atomically", () => {
    const result = quoteDraftWritebackSchema.safeParse({
      ...quotePayload,
      quote: { ...quotePayload.quote, total_value: 1 },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain("QUOTE_TOTAL_MISMATCH");
  });
  it("accepts_authoritative_total_200", () => {
    expect(quoteDraftWritebackSchema.parse(quotePayload).quote.total_value).toBe(200);
  });
  it("rejects_21_items_without_truncation", () => {
    expect(
      quoteDraftWritebackSchema.safeParse({
        ...quotePayload,
        quote: {
          ...quotePayload.quote,
          total_value: 4200,
          line_items: Array.from({ length: 21 }, (_, i) => ({ ...line, id: String(i) })),
        },
      }).success,
    ).toBe(false);
  });
  it.each([
    { label: "empty", items: [] },
    { label: "duplicates", items: [line, line] },
  ])("rejects $label items", ({ items: line_items }) => {
    expect(
      quoteDraftWritebackSchema.safeParse({
        ...quotePayload,
        quote: { ...quotePayload.quote, line_items },
      }).success,
    ).toBe(false);
  });
  it.each([null, "", "100", true, -1, Number.NaN, Infinity])(
    "rejects_null_blank_boolean_numbers %j",
    (unit_price) => {
      expect(
        quoteDraftWritebackSchema.safeParse({
          ...quotePayload,
          quote: { ...quotePayload.quote, line_items: [{ ...line, unit_price }] },
        }).success,
      ).toBe(false);
    },
  );
  it.each([0, -1, null, "", true])("rejects invalid quantity %j", (qty) => {
    expect(
      quoteDraftWritebackSchema.safeParse({
        ...quotePayload,
        quote: { ...quotePayload.quote, line_items: [{ ...line, qty }] },
      }).success,
    ).toBe(false);
  });
  it.each(["2026-02-30", "yesterday", "2026-13-01"])("rejects invalid date %s", (valid_until) => {
    expect(
      quoteDraftWritebackSchema.safeParse({
        ...quotePayload,
        quote: { ...quotePayload.quote, valid_until },
      }).success,
    ).toBe(false);
  });
  const shapes = [
    [
      qualificationWritebackSchema,
      {
        lead_id: "lead",
        agent_run_id: "run",
        qualification_data: validQualification,
        lead_score: 80,
        output_summary: "Synthetic",
      },
      "confidence_score",
    ],
    [
      replyDraftWritebackSchema,
      {
        lead_id: "lead",
        agent_run_id: "run",
        draft_message: "Synthetic",
        context_summary: "Synthetic",
      },
      "confidence_score",
    ],
    [quoteDraftWritebackSchema, quotePayload, "confidence_score"],
    [
      scoreRenewalRiskWritebackSchema,
      {
        engagement_id: "engagement",
        agent_run_id: "run",
        health_score: 80,
        renewal_risk: "medium",
        risk_reasoning: "Synthetic",
        suggested_next_action: "Review",
        output_summary: "Synthetic",
      },
      "confidence",
    ],
    [
      relationshipIntelligenceWritebackSchema,
      {
        account_id: "account",
        agent_run_id: "run",
        signals: [],
        next_action: null,
        output_summary: "Synthetic",
      },
      "confidence_score",
    ],
  ] as const;
  it.each(shapes)("bounds confidence for every callback", (schema, payload, key) => {
    for (const value of [0, 1])
      expect(schema.safeParse({ ...payload, [key]: value }).success).toBe(true);
    for (const value of [null, "", true, -0.01, 1.01, Number.NaN, Infinity])
      expect(schema.safeParse({ ...payload, [key]: value }).success).toBe(false);
  });
  it("does_not_invent_budget", () => {
    expect(
      buildQualificationFallback({ context, agentRunId: "run" }).qualification_data,
    ).toMatchObject({ budget_range: "HKD 1000" });
  });
  it.each([
    "No budget specified",
    "no budget of HKD 1000",
    "budget HKD 1000 or USD 200",
    "budget HKD 1000-2000",
    "budget $1000",
    "budget HKD 1k",
    "預算 HKD 1萬",
    "每月預算 HKD 1000",
    "budget HKD 1000 per month",
  ])("does not guess ambiguous budget: %s", (enquiry_text) => {
    expect(
      buildQualificationFallback({
        context: { ...context, lead: { ...context.lead, enquiry_text } },
        agentRunId: "run",
      }).qualification_data,
    ).toMatchObject({ budget_range: "unknown" });
  });
  it("requires trusted pricing for quote fallback", () => {
    expect(() =>
      buildQuoteDraftFallback({ context, agentRunId: "run", now: new Date("2026-10-03") }),
    ).toThrow("QUOTE_PRICING_UNAVAILABLE");
  });
});
