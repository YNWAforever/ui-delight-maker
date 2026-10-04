import { describe, expect, it } from "vitest";
import { explicitDemoProvenance, matchesAgentDataFilter } from "../agent-data-scope";

describe("explicit demo origin", () => {
  it.each([
    null,
    {},
    { demo: "true" },
    { demo: 1 },
    { agent_name: "demo-example" },
    { output_data: { demo: true } },
  ])("keeps unsupported provenance unknown: %o", (input) => {
    expect(explicitDemoProvenance(input)).toBeNull();
  });
  it("accepts only an explicit boolean and keeps unknown separate from non-demo", () => {
    expect(explicitDemoProvenance({ demo: true })).toBe(true);
    expect(explicitDemoProvenance({ demo: false })).toBe(false);
    expect(matchesAgentDataFilter(null, "non-demo")).toBe(false);
    expect(matchesAgentDataFilter(null, "unknown")).toBe(true);
    expect(matchesAgentDataFilter(true, "demo")).toBe(true);
    expect(matchesAgentDataFilter(false, "demo")).toBe(false);
    expect(matchesAgentDataFilter(undefined, "all")).toBe(true);
  });
});
