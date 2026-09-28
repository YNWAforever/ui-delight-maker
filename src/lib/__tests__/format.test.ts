import { describe, expect, it } from "vitest";
import {
  formatCommercialMoney,
  formatCount,
  formatCurrencyAmount,
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatPercent,
  formatTime,
} from "../format";

describe("format helpers", () => {
  it("formats instants in Hong Kong across the UTC day boundary", () => {
    expect(formatDateTime("2026-09-26T16:30:00.000Z")).toBe("27 Sept 2026, 00:30");
    expect(formatDate("2026-09-26T16:30:00.000Z")).toBe("27 Sept 2026");
    expect(formatTime("2026-09-26T16:30:00.000Z")).toBe("00:30");
  });

  it("keeps the Hong Kong year boundary regardless of host time zone", () => {
    const instant = "2025-12-31T16:30:00.000Z";
    const previous = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const serverLike = formatDateTime(instant);
      process.env.TZ = "America/Los_Angeles";
      const browserLike = formatDateTime(instant);
      expect(serverLike).toBe("01 Jan 2026, 00:30");
      expect(browserLike).toBe(serverLike);
      expect(formatDateTime(instant, { timeZone: "UTC" })).toBe("31 Dec 2025, 16:30");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it("accepts Date inputs", () => {
    expect(formatDate(new Date("2026-07-12T09:45:00.000Z"))).toBe("12 Jul 2026");
    expect(formatTime(new Date("2026-07-12T09:45:00.000Z"))).toBe("17:45");
  });

  it("returns a safe dash for invalid or nullish dates", () => {
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatTime(null)).toBe("—");
  });

  it("formats percentages and counts", () => {
    expect(formatPercent(0.876)).toBe("88%");
    expect(formatPercent(null)).toBe("—");
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(formatCount(undefined)).toBe("0");
  });
  it("keeps date-only values as calendar dates", () => {
    expect(formatDateOnly("2026-09-27")).toBe("27 Sept 2026");
    expect(formatDate("2026-09-27")).toBe("27 Sept 2026");
  });

  it("preserves two commercial decimals without floating-point loss", () => {
    expect(formatCommercialMoney("100.25", "HKD")).toBe("HKD 100.25");
    expect(formatCommercialMoney("90071992547409.25", "USD")).toBe("USD 90,071,992,547,409.25");
    expect(formatCurrencyAmount(100.25, "HKD")).toBe("HKD 100.25");
  });
});
