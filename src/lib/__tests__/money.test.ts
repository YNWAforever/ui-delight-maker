import { describe, expect, it } from "vitest";
import { roundToMoney, sumAmounts, toAmount } from "@/lib/money";

/**
 * Postgres returns `numeric` as a string. These helpers exist because the TypeScript types
 * declare those columns `number`, so `sum + row.total_value` concatenated instead of adding —
 * "0184000.0092000.00" — and `Intl.NumberFormat` turned the result into "HK$NaN" on the money
 * tiles. Every case below is a shape that actually reached the UI.
 */
describe("toAmount", () => {
  it("accepts the string form Postgres emits for numeric", () => {
    expect(toAmount("184000.00")).toBe(184000);
    expect(toAmount("0.50")).toBe(0.5);
    expect(toAmount("-1200.25")).toBe(-1200.25);
  });

  it("passes finite numbers through unchanged", () => {
    expect(toAmount(184000)).toBe(184000);
    expect(toAmount(0)).toBe(0);
  });

  it("treats absent and unparseable values as zero rather than NaN", () => {
    // A single NaN propagates through an entire total and surfaces as "HK$NaN" on screen, so
    // these must not produce one.
    for (const value of [null, undefined, "", "   ", "not a number", Number.NaN, Infinity]) {
      expect(toAmount(value as never)).toBe(0);
    }
  });
});

describe("sumAmounts", () => {
  it("adds string amounts numerically instead of concatenating them", () => {
    const quotes = [{ total_value: "184000.00" }, { total_value: "92000.00" }];

    expect(sumAmounts(quotes, (quote) => quote.total_value)).toBe(276000);
  });

  it("adds a mix of strings, numbers and nulls", () => {
    const rows = [{ arr: "1200.50" }, { arr: 800 }, { arr: null }];

    expect(sumAmounts(rows, (r) => r.arr)).toBe(2000.5);
  });

  it("is zero for an empty set", () => {
    expect(sumAmounts([], () => null)).toBe(0);
  });

  it("never yields NaN, which is what reached the money tiles", () => {
    const rows = [{ v: "oops" }, { v: "1000.00" }];

    expect(Number.isNaN(sumAmounts(rows, (r) => r.v))).toBe(false);
    expect(sumAmounts(rows, (r) => r.v)).toBe(1000);
  });
});

describe("roundToMoney", () => {
  it("rounds to the two decimal places the schema stores", () => {
    expect(roundToMoney(1.005)).toBe(1.01);
    expect(roundToMoney("1234.567")).toBe(1234.57);
    expect(roundToMoney(0.1 + 0.2)).toBe(0.3);
  });
});
