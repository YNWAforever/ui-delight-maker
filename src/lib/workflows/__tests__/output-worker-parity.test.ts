import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  validateQuoteDraft,
  CURRENCY_MINOR_UNITS,
  extractExplicitBudget,
} from "../output-contracts";
import { validQualification } from "./commercial-fixtures";
import {
  qualificationWritebackSchema,
  quoteDraftWritebackSchema,
  replyDraftWritebackSchema,
  scoreRenewalRiskWritebackSchema,
  relationshipIntelligenceWritebackSchema,
} from "@/server/workflows/writeback-payloads.server";

const common = readFileSync("n8n/contracts/clientops-output-contracts.js", "utf8").replaceAll(
  "\r\n",
  "\n",
);
const native = new Function(common + ";return {validateQuoteDraft,extractExplicitBudget};")() as {
  validateQuoteDraft: typeof validateQuoteDraft;
  extractExplicitBudget: typeof extractExplicitBudget;
};
const context = {
  lead: { enquiry_text: "預算 HKD 1000" },
  pricing_templates: [{ currency: "HKD", unit_price: 100, service: "Synthetic" }],
  agent_run: { attempt_id: "attempt" },
};
const quote = {
  currency: "HKD",
  total_value: 200,
  valid_until: "2026-10-31",
  line_items: [
    { id: "one", service: "Synthetic", description: "Synthetic", qty: 2, unit_price: 100 },
  ],
};
const currencyContext = {
  allowedCurrencies: ["HKD", "JPY"],
  minorUnitsByCurrency: CURRENCY_MINOR_UNITS,
};
function outcome(work: () => unknown) {
  try {
    return { ok: true, value: work() };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
const cases = [
  [
    "qualify-lead",
    qualificationWritebackSchema,
    {
      qualification_data: validQualification,
      lead_score: 80,
      confidence_score: 0.8,
      output_summary: "Synthetic",
    },
    "confidence_score",
  ],
  [
    "draft-reply",
    replyDraftWritebackSchema,
    { draft_message: "Synthetic draft", context_summary: "Synthetic", confidence_score: 0.8 },
    "confidence_score",
  ],
  [
    "draft-quote",
    quoteDraftWritebackSchema,
    { quote, create_send_approval: true, confidence_score: 0.8 },
    "confidence_score",
  ],
  [
    "score-renewal-risk",
    scoreRenewalRiskWritebackSchema,
    {
      health_score: 80,
      renewal_risk: "medium",
      risk_reasoning: "Synthetic",
      suggested_next_action: "Review",
      confidence: 0.8,
      output_summary: "Synthetic",
    },
    "confidence",
  ],
  [
    "relationship-intelligence",
    relationshipIntelligenceWritebackSchema,
    { signals: [], next_action: null, confidence_score: 0.8, output_summary: "Synthetic" },
    "confidence_score",
  ],
] as const;
function worker(name: string, content: unknown, providerError = false) {
  const template = JSON.parse(readFileSync("n8n/workflows/clientops-" + name + ".json", "utf8"));
  const resolver = template.nodes.find((node: { name: string }) => node.name === "Resolve Output");
  expect(resolver.parameters.jsCode.replaceAll("\r\n", "\n").startsWith(common)).toBe(true);
  const fallback = {
    ...cases.find(([workflow]) => workflow === name)![2],
    lead_id: "lead",
    engagement_id: "engagement",
    account_id: "account",
    agent_run_id: "run",
  };
  const prepared = {
    openrouter_configured: true,
    openrouter_request: { model: "requested" },
    context,
    fallback,
  };
  const response = providerError
    ? { error: { message: "private upstream body" } }
    : {
        model: "actual",
        id: "receipt",
        usage: { total_tokens: 125 },
        choices: [{ message: { content: JSON.stringify(content) } }],
      };
  return new Function("$input", "$", "$execution", resolver.parameters.jsCode)(
    { first: () => ({ json: response }) },
    () => ({ first: () => ({ json: prepared }) }),
    { id: "execution" },
  )[0].json;
}
describe("independent strict server / native worker parity", () => {
  it.each([
    quote,
    { ...quote, total_value: 1 },
    { ...quote, line_items: [] },
    { ...quote, line_items: [quote.line_items[0], quote.line_items[0]] },
    { ...quote, valid_until: "2026-02-30" },
    { ...quote, currency: "XYZ" },
    {
      ...quote,
      line_items: Array.from({ length: 21 }, (_, i) => ({ ...quote.line_items[0], id: String(i) })),
    },
  ])("agrees on the complete quote fixture %j", (fixture) => {
    expect(outcome(() => native.validateQuoteDraft(fixture, currencyContext))).toEqual(
      outcome(() => validateQuoteDraft(fixture, currencyContext)),
    );
  });
  it.each([
    [1.005, 1, 1.01],
    [0.005, 2, 0.01],
    [1e-3, 5, 0.01],
    [0, 1, 0],
  ])("rounds each decimal line half-up at price %s", (unit_price, qty, total_value) => {
    const fixture = {
      ...quote,
      total_value,
      line_items: [{ ...quote.line_items[0], unit_price, qty }],
    };
    expect(native.validateQuoteDraft(fixture, currencyContext)).toEqual(
      validateQuoteDraft(fixture, currencyContext),
    );
  });
  it.each([
    "HKD1000",
    "預算港幣 1,000",
    "budget USD 1000.50",
    "No budget HKD 1000",
    "HKD 1000 or USD 1000",
    "budget HKD 1000-2000",
    "每月 HKD 1000",
    "$1000",
    "not confirmed",
  ])("agrees on budget evidence %s", (text) => {
    expect(native.extractExplicitBudget(text)).toEqual(extractExplicitBudget(text));
  });
  it.each(cases)(
    "%s accepts complete valid output and rejects null without partial fallback",
    (name, schema, payload, confidence) => {
      expect(schema.safeParse(worker(name, payload)).success).toBe(true);
      for (const value of [null, "", true, -1, 1.01]) {
        const invalid = worker(name, { ...payload, [confidence]: value });
        expect(invalid.output_outcome).toBe("invalid_output");
        expect(schema.safeParse(invalid).success).toBe(false);
        expect(invalid.usage.totalTokens).toBe(125);
        expect(invalid.execution_metadata.source).toBe("provider");
        expect(invalid).not.toHaveProperty("quote");
        expect(invalid).not.toHaveProperty("draft_message");
        expect(invalid).not.toHaveProperty("qualification_data");
      }
    },
  );
  it("rejects worker total=1 with QUOTE_TOTAL_MISMATCH and retains transport cost", () => {
    const output = worker("draft-quote", { ...cases[2][2], quote: { ...quote, total_value: 1 } });
    expect(output.invalid_output_code).toBe("QUOTE_TOTAL_MISMATCH");
    expect(output).not.toHaveProperty("quote");
    expect(output.usage.totalTokens).toBe(125);
  });
  it("does not treat missing provider fields as fallback success", () => {
    expect(worker("draft-reply", { confidence_score: 0.8 }).output_outcome).toBe("invalid_output");
  });
  it("uses the same complete contract for unavailable provider fallback", () => {
    const output = worker("qualify-lead", null, true);
    expect(qualificationWritebackSchema.safeParse(output).success).toBe(true);
    expect(output.qualification_data.budget_range).toBe("HKD 1000");
    expect(output.execution_metadata.source).toBe("deterministic_fallback");
    expect(JSON.stringify(output.execution_metadata)).not.toContain("private upstream body");
  });
});
