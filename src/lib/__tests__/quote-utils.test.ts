import { describe, it, expect } from "vitest";
import { calculateTotal, newLineItem } from "../quote-utils";

describe("calculateTotal", () => {
  it("sums qty × unit_price for all items", () => {
    const items = [
      { id: "1", service: "A", description: "", qty: 2, unit_price: 10000 },
      { id: "2", service: "B", description: "", qty: 1, unit_price: 38000 },
    ];
    expect(calculateTotal(items)).toBe(58000);
  });

  it("returns 0 for empty array", () => {
    expect(calculateTotal([])).toBe(0);
  });

  it("handles qty 0 without NaN", () => {
    const items = [{ id: "1", service: "A", description: "", qty: 0, unit_price: 50000 }];
    expect(calculateTotal(items)).toBe(0);
  });
});

describe("newLineItem", () => {
  it("creates a line item from a pricing template with qty 1", () => {
    const template = {
      id: "tpl-1",
      service: "AI Chatbot Integration",
      description: "Custom GPT chatbot for customer support",
      category: "AI transformation" as const,
      unit_price: 80000,
      currency: "HKD",
      active: true,
      product_id: null,
    };
    const item = newLineItem(template);
    expect(item.service).toBe("AI Chatbot Integration");
    expect(item.description).toBe("Custom GPT chatbot for customer support");
    expect(item.qty).toBe(1);
    expect(item.unit_price).toBe(80000);
    expect(item.id).toBeTruthy();
  });

  it("uses empty string for null description", () => {
    const template = {
      id: "tpl-2",
      service: "Custom",
      description: null,
      category: null,
      unit_price: 10000,
      currency: "HKD",
      active: true,
      product_id: null,
    };
    const item = newLineItem(template);
    expect(item.description).toBe("");
  });
});
