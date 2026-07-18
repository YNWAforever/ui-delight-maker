import { describe, expect, it } from "vitest";
import { getBusinessDateKey } from "../business-date";

describe("getBusinessDateKey", () => {
  it("uses the prior Hong Kong date one second before local midnight", () => {
    expect(getBusinessDateKey(new Date("2026-07-12T15:59:59.000Z"))).toBe("2026-07-12");
  });

  it("rolls over at midnight in Hong Kong", () => {
    expect(getBusinessDateKey(new Date("2026-07-12T16:00:00.000Z"))).toBe("2026-07-13");
  });
});
