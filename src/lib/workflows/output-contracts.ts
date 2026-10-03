import { z } from "zod";
import type { QuoteDraftWritebackPayload } from "./types";

export class AIOutputContractError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AIOutputContractError";
  }
}
const ERROR_CODES = [
  "INVALID_AI_OUTPUT",
  "INVALID_QUOTE_OUTPUT",
  "QUOTE_TOTAL_MISMATCH",
  "QUOTE_DUPLICATE_ITEM",
  "QUOTE_CURRENCY_UNSUPPORTED",
  "QUOTE_TOTAL_OVERFLOW",
  "QUOTE_PRICING_UNAVAILABLE",
  "INVALID_QUOTE_ITEM",
  "INVALID_QUOTE_DATE",
];
export function safeOutputErrorCode(value: unknown): string {
  return typeof value === "string"
    ? (ERROR_CODES.find((code) => value.includes(code)) ?? "INVALID_AI_OUTPUT")
    : "INVALID_AI_OUTPUT";
}
export function parseAIOutput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AIOutputContractError(safeOutputErrorCode(result.error.message));
  return result.data;
}
export const confidenceSchema = z.number().finite().min(0).max(1);
export const scoreSchema = z.number().finite().min(0).max(100);
export const qualificationOutputSchema = z.object({
  urgency_score: z.number().finite().min(0).max(10),
  fit_score: z.number().finite().min(0).max(10),
  qualification_score: scoreSchema,
  service_interest: z.array(z.string().trim().min(1)).max(20),
  budget_range: z.string().trim().min(1),
  next_action: z.enum([
    "Schedule discovery call",
    "Send intro deck",
    "Request more info",
    "Disqualify",
  ]),
  reason: z.string(),
  confidence: confidenceSchema,
  human_review_required: z.boolean(),
});
// Supported server currency precision; models never supply this configuration.
export const CURRENCY_MINOR_UNITS: Readonly<Record<string, number>> = {
  HKD: 2,
  USD: 2,
  CNY: 2,
  EUR: 2,
  GBP: 2,
  SGD: 2,
  MYR: 2,
  JPY: 0,
  KRW: 0,
};
export type QuoteValidationContext = {
  allowedCurrencies: readonly string[];
  minorUnitsByCurrency: Readonly<Record<string, number>>;
};
export type ValidatedQuoteDraft = QuoteDraftWritebackPayload["quote"];
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00.000Z");
    return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, "INVALID_QUOTE_DATE");
const quoteShape = z.object({
  number: z.string().trim().min(1).nullable().optional(),
  currency: z.string().trim().min(1),
  total_value: z.number().finite().nonnegative(),
  valid_until: date.nullable().optional(),
  line_items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        service: z.string().trim().min(1),
        description: z.string(),
        qty: z.number().finite().positive(),
        unit_price: z.number().finite().nonnegative(),
      }),
    )
    .min(1)
    .max(20),
});
function fraction(value: number) {
  const [base, exponent = "0"] = value.toString().toLowerCase().split("e");
  const digits = base.replace(".", ""),
    scale = (base.split(".")[1]?.length ?? 0) - Number(exponent);
  return scale < 0
    ? { n: BigInt(digits) * 10n ** BigInt(-scale), d: 1n }
    : { n: BigInt(digits), d: 10n ** BigInt(scale) };
}
export function computeQuoteTotal(
  items: ValidatedQuoteDraft["line_items"],
  minorUnits: number,
): number {
  if (!Number.isInteger(minorUnits) || minorUnits < 0 || minorUnits > 4)
    throw new AIOutputContractError("QUOTE_CURRENCY_UNSUPPORTED");
  const factor = 10n ** BigInt(minorUnits);
  let total = 0n;
  for (const item of items) {
    if (
      typeof item.qty !== "number" ||
      !Number.isFinite(item.qty) ||
      item.qty <= 0 ||
      typeof item.unit_price !== "number" ||
      !Number.isFinite(item.unit_price) ||
      item.unit_price < 0
    )
      throw new AIOutputContractError("INVALID_QUOTE_ITEM");
    const quantity = fraction(item.qty),
      price = fraction(item.unit_price),
      denominator = quantity.d * price.d;
    total += (quantity.n * price.n * factor * 2n + denominator) / (2n * denominator);
    if (total > BigInt(Number.MAX_SAFE_INTEGER))
      throw new AIOutputContractError("QUOTE_TOTAL_OVERFLOW");
  }
  return Number(total) / Number(factor);
}
export function validateQuoteDraft(
  input: unknown,
  context: QuoteValidationContext,
): ValidatedQuoteDraft {
  const parsed = quoteShape.safeParse(input);
  if (!parsed.success) throw new AIOutputContractError("INVALID_QUOTE_OUTPUT");
  const quote = parsed.data;
  if (new Set(quote.line_items.map((item) => item.id)).size !== quote.line_items.length)
    throw new AIOutputContractError("QUOTE_DUPLICATE_ITEM");
  const precision = context.minorUnitsByCurrency[quote.currency];
  if (!context.allowedCurrencies.includes(quote.currency) || precision === undefined)
    throw new AIOutputContractError("QUOTE_CURRENCY_UNSUPPORTED");
  const computed = computeQuoteTotal(quote.line_items, precision),
    supplied = fraction(quote.total_value),
    authoritative = fraction(computed);
  if (supplied.n * authoritative.d !== authoritative.n * supplied.d)
    throw new AIOutputContractError("QUOTE_TOTAL_MISMATCH");
  return { ...quote, total_value: computed };
}
export const quoteOutputSchema = quoteShape.superRefine((value, ctx) => {
  try {
    validateQuoteDraft(value, {
      allowedCurrencies: Object.keys(CURRENCY_MINOR_UNITS),
      minorUnitsByCurrency: CURRENCY_MINOR_UNITS,
    });
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof AIOutputContractError ? error.code : "INVALID_QUOTE_OUTPUT",
    });
  }
});

/** Only a single explicit, unambiguous amount; evidence is the original enquiry. */
export function extractExplicitBudget(
  text: string,
): { amount: number; currency: string; evidence: string } | null {
  if (
    /\b(no|not|without|unknown|unconfirmed|monthly|per\s+month)\b|沒有|未定|不確定|並非|不是|每月|月費|[-–—~至]\s*\d|\d\s*(?:to|到)\s*\d|\d\s*(?:[km]\b|萬|千|million\b|thousand\b)/i.test(
      text,
    )
  )
    return null;
  const matches = [
    ...text.matchAll(
      /\b(HKD|USD|CNY|EUR|GBP|SGD|MYR|JPY|KRW)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)(?![0-9.,])|(?:港幣|港元|HK\$)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)(?![0-9.,])/gi,
    ),
  ];
  if (matches.length !== 1) return null;
  const match = matches[0],
    amount = Number((match[2] ?? match[3]).replaceAll(",", "")),
    currency = (match[1] ?? "HKD").toUpperCase();
  const remainder = text.slice(0, match.index) + text.slice(match.index! + match[0].length);
  if (
    /\d|\$|\b(HKD|USD|CNY|EUR|GBP|SGD|MYR|JPY|KRW)\b/i.test(remainder) ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isSafeInteger(Math.round(amount * 100))
  )
    return null;
  return { amount, currency, evidence: text };
}
