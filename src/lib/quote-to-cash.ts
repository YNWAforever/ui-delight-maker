import { formatHKD } from "@/lib/format";
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
}): JobSheetAcceptanceCheck {
  const reasons: string[] = [];
  const reconciliation = getPortionReconciliation(input.totalAmount, input.portions);

  if (!reconciliation.reconciled) {
    const direction = reconciliation.delta > 0 ? "short by" : "over by";
    reasons.push(`Billing portions are ${direction} ${formatHKD(Math.abs(reconciliation.delta))}.`);
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
