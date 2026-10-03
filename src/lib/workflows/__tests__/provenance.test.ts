import { describe, expect, it } from "vitest";
import { qualificationWritebackSchema } from "@/server/workflows/writeback-payloads.server";
import { validQualification } from "./commercial-fixtures";

const metadata = {
  source: "provider",
  providerRequestId: "synthetic-receipt",
  workerExecutionId: "synthetic-execution",
  workerVersion: "synthetic-v1",
  requestedModel: "requested",
  actualModel: "transport-actual",
  fallbackReason: null,
};
const payload = {
  lead_id: "synthetic-lead",
  agent_run_id: "synthetic-run",
  lead_score: 80,
  qualification_data: validQualification,
  output_summary: "Synthetic",
  confidence_score: 0.8,
};

describe("callback provenance contract", () => {
  it("preserves allowlisted transport metadata and strips prompt / secret / response fields", () => {
    const parsed = qualificationWritebackSchema.parse({
      ...payload,
      execution_metadata: {
        ...metadata,
        prompt: "private input",
        apiKey: "synthetic-not-a-key",
        response: { raw: "private body" },
      },
    });
    expect(parsed).toHaveProperty("execution_metadata", metadata);
    expect(JSON.stringify(parsed)).not.toContain("private input");
  });
  it("preserves_unknown_usage without coercing null into zero", () => {
    const parsed = qualificationWritebackSchema.safeParse({
      ...payload,
      usage: { totalTokens: 0, source: "openrouter" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.usage).toEqual({ totalTokens: 0, source: "openrouter" });
    for (const value of [-1, Number.NaN, null, "", true])
      expect(
        qualificationWritebackSchema.safeParse({
          ...payload,
          usage: { totalTokens: value, source: "openrouter" },
        }).success,
      ).toBe(false);
  });
  it("does not invent provenance for a compatible old callback", () => {
    expect(qualificationWritebackSchema.parse(payload)).not.toHaveProperty("execution_metadata");
  });
});
