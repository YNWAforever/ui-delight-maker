import { describe, expect, it } from "vitest";
import { formatCount, formatDate, formatDateTime, formatPercent, formatTime } from "../format";

describe("format helpers", () => {
  it("formats date and time values in UTC", () => {
    expect(formatDateTime("2026-07-12T09:45:00.000Z")).toBe("12 Jul 2026, 09:45");
    expect(formatTime("2026-07-12T09:45:00.000Z")).toBe("09:45");
  });

  it("accepts Date inputs", () => {
    expect(formatDate(new Date("2026-07-12T09:45:00.000Z"))).toBe("12 Jul 2026");
    expect(formatTime(new Date("2026-07-12T09:45:00.000Z"))).toBe("09:45");
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
});
