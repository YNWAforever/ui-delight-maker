// src/lib/quote-utils.ts
import type { QuoteLineItem, PricingTemplate } from "@/lib/types";

/**
 * Compute the sum of (qty × unit_price) for all line items.
 */
export function calculateTotal(items: QuoteLineItem[]): number {
  return items.reduce((sum, li) => sum + li.qty * li.unit_price, 0);
}

/**
 * Create a new QuoteLineItem from a PricingTemplate with qty = 1.
 */
export function newLineItem(template: PricingTemplate): QuoteLineItem {
  return {
    id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    service: template.service,
    description: template.description ?? "",
    qty: 1,
    unit_price: template.unit_price ?? 0,
  };
}
