import { describe, expect, it } from "vitest";
import { decimalText, decimalUnits } from "../values.server";

describe("exact WFM reconciliation decimals", () => {
  it("sums decimals without floating point drift or currency rounding", () => {
    expect(decimalText(decimalUnits(0.1) + decimalUnits(0.2))).toBe("0.3");
    expect(decimalText(decimalUnits("7150.1000"))).toBe("7150.1");
    expect(decimalText(decimalUnits(1e-7))).toBe("0.0000001");
    expect(decimalText(decimalUnits("-12.000000000000000001"))).toBe("-12.000000000000000001");
  });
  it.each([null, undefined, NaN, Infinity, 1e20, "0.0000000000000000001", "", "1e10000"])(
    "rejects missing/unsafe decimals %s",
    (value) => {
      expect(() => decimalUnits(value)).toThrow();
    },
  );
});
