import { describe, expect, it } from "vitest";
import { agentPolicyChangeSchema } from "../agent-policy-input";
describe("auxiliary policy allowlist", () => {
  it("governs note_tidy through the existing status writer only", () => {
    expect(
      agentPolicyChangeSchema.parse({
        workflowType: "note_tidy",
        status: "inactive",
        reason: "Operator review of note tidy",
        expectedVersionId: null,
      }).workflowType,
    ).toBe("note_tidy");
  });
  it("does not turn retention_sweep into a governed auxiliary workflow", () => {
    expect(
      agentPolicyChangeSchema.safeParse({
        workflowType: "retention_sweep",
        status: "inactive",
        reason: "Operator review of retention",
        expectedVersionId: null,
      }).success,
    ).toBe(false);
  });
});
