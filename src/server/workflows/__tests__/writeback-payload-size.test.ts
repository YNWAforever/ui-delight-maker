import { describe, expect, it } from "vitest";
import { qualificationWritebackSchema, readWritebackPayload } from "../writeback-payloads.server";

describe("authenticated callback body resource limit", () => {
  it("bounds actual bytes even when Content-Length is absent", async () => {
    const request = new Request("https://synthetic.invalid/callback", {
      method: "POST",
      body: JSON.stringify({
        lead_id: "synthetic",
        agent_run_id: "synthetic",
        qualification_data: {},
        lead_score: 80,
        confidence_score: 0.8,
        output_summary: "x".repeat(128 * 1024),
      }),
    });
    const result = await readWritebackPayload(request, qualificationWritebackSchema);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
  });
});
