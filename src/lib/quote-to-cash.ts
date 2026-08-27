import { getBusinessDateKey } from "@/lib/business-date";
import { formatCurrencyAmount } from "@/lib/format";
import { roundToMoney } from "@/lib/money";
import type {
  JobSheetBillingType,
  JobSheetPortionStatus,
  QuoteLineItem,
  QuoteLineItemRecord,
} from "@/lib/types";

export type NewJobSheetPortion = {
  id?: string;
  name: string;
  source_quote_line_item_ids: string[];
  description: string;
  amount: number;
  currency: string;
  target_invoice_date?: string | null;
  billing_type: JobSheetBillingType;
  status: JobSheetPortionStatus;
  sort_order: number;
};

export type PortionReconciliation = {
  totalAmount: number;
  portionTotal: number;
  delta: number;
  reconciled: boolean;
};

export type JobSheetAcceptanceCheck = {
  ok: boolean;
  reasons: string[];
};

/**
 * How long a new quote stays valid, in days, unless its author says otherwise.
 *
 * A policy constant rather than a literal in the builder, because the builder used to
 * default `valid_until` to the fixed calendar date `2026-06-30`. Every quote whose author
 * did not change the field was written with that date, and after it passed the default
 * silently produced quotes that were already expired the moment they were created.
 */
export const DEFAULT_QUOTE_VALIDITY_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * The default `valid_until` for a new quote, as a `YYYY-MM-DD` date string.
 *
 * Anchored to the Hong Kong business day through `getBusinessDateKey`, the same boundary
 * every other business-date calculation here uses, and computed from an explicit `from`
 * so a caller can keep it stable. Route loaders should call this and pass the result down:
 * reading the clock during render makes the server and the first client render disagree,
 * which React reports as a hydration mismatch.
 */
export function defaultQuoteValidUntil(
  from: Date = new Date(),
  days: number = DEFAULT_QUOTE_VALIDITY_DAYS,
): string {
  const today = getBusinessDateKey(from);
  const start = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
  return new Date(start + days * DAY_MS).toISOString().slice(0, 10);
}

export function calculateQuoteLineTotal(item: Pick<QuoteLineItem, "qty" | "unit_price">): number {
  return roundToMoney((Number(item.qty) || 0) * (Number(item.unit_price) || 0));
}

export function calculateQuoteTotal(
  items: Array<Pick<QuoteLineItem, "qty" | "unit_price">>,
): number {
  return roundToMoney(items.reduce((sum, item) => sum + calculateQuoteLineTotal(item), 0));
}

export function buildDefaultPortionsFromLineItems(
  items: QuoteLineItemRecord[],
  currency: string,
): NewJobSheetPortion[] {
  return items.map((item, index) => ({
    name: item.service || `Billing portion ${index + 1}`,
    source_quote_line_item_ids: [item.id],
    description: item.description,
    amount: calculateQuoteLineTotal(item),
    currency,
    billing_type: "progress",
    status: "planned",
    sort_order: index,
  }));
}

export function getPortionReconciliation(
  totalAmount: number,
  portions: Array<{ amount: number }>,
): PortionReconciliation {
  const portionTotal = roundToMoney(
    portions.reduce((sum, portion) => sum + (Number(portion.amount) || 0), 0),
  );
  const roundedTotalAmount = roundToMoney(Number(totalAmount) || 0);
  const delta = roundToMoney(roundedTotalAmount - portionTotal);
  return {
    totalAmount: roundedTotalAmount,
    portionTotal,
    delta,
    reconciled: delta === 0,
  };
}

export function canAcceptJobSheet(input: {
  totalAmount: number;
  portions: Array<{ amount: number }>;
  requirePoNumber: boolean;
  poNumber?: string | null;
  clientOrderNumber?: string | null;
  /**
   * The job sheet's own currency. Optional, defaulting to HKD, so the many existing callers
   * keep their exact wording — but a USD job sheet used to be told "short by HKD 1,234"
   * while the billing table directly above it formatted the same delta in USD.
   */
  currency?: string | null;
}): JobSheetAcceptanceCheck {
  const reasons: string[] = [];
  const reconciliation = getPortionReconciliation(input.totalAmount, input.portions);

  if (!reconciliation.reconciled) {
    const direction = reconciliation.delta > 0 ? "short by" : "over by";
    reasons.push(
      `Billing portions are ${direction} ${formatCurrencyAmount(
        Math.abs(reconciliation.delta),
        input.currency ?? "HKD",
      )}.`,
    );
  }

  if (input.requirePoNumber && !input.poNumber?.trim() && !input.clientOrderNumber?.trim()) {
    reasons.push("PO number or client order number is required before acceptance.");
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

/*
 * `isLockedJobSheetCommercialField` and its LOCKED_COMMERCIAL_FIELDS set used to live here.
 * Nothing in the application ever called either — only their own test did, and it asserted the
 * set's membership against the literal it was built from — so they read as an enforced rule
 * while enforcing nothing. The rule is real and now lives where it can be applied: job sheets
 * are frozen once accepted or locked (`replaceJobSheetPortions`), and a portion already entered
 * in Xero keeps its amount, currency, invoice date and billing type through the UPDATE itself.
 */
