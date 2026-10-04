import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
const seam = vi.hoisted(() => ({ batch: vi.fn(), read: vi.fn(), token: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/server/workflows/assert-workflow-token.server", () => ({
  assertWorkflowToken: seam.token,
}));
vi.mock("@/server/repositories/retention-sweeps", () => ({ readRetentionSweep: seam.read }));
vi.mock("@/server/workflows/retention-sweep.server", () => ({
  runRetentionSweepBatch: seam.batch,
  retentionSweepId: () => "00000000-0000-4000-8000-000000000001",
}));
import {
  handleRetentionSweep,
  retentionRuntimeBudget,
} from "@/routes/api/workflows/retention-sweep";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
const request = (body: string) =>
  new Request("https://fixture.invalid/api/workflows/retention-sweep", { method: "POST", body });
function verified() {
  vi.stubEnv("CLIENTOPS_RETENTION_RUNTIME_VERIFIED", "1");
  vi.stubEnv("CLIENTOPS_RETENTION_MAX_DURATION_SECONDS", "60");
  seam.read.mockResolvedValue(null);
  seam.batch.mockResolvedValue({ complete: false });
}
describe("bounded retention transport and source continuation contract", () => {
  it("requires verified deployment duration before any DB or dispatch", async () => {
    vi.stubEnv("CLIENTOPS_RETENTION_RUNTIME_VERIFIED", "");
    expect((await handleRetentionSweep(request("{}"))).status).toBe(503);
    expect(seam.token).toHaveBeenCalled();
    expect(seam.read).not.toHaveBeenCalled();
    expect(seam.batch).not.toHaveBeenCalled();
    expect(
      retentionRuntimeBudget({
        CLIENTOPS_RETENTION_RUNTIME_VERIFIED: "1",
        CLIENTOPS_RETENTION_MAX_DURATION_SECONDS: "29",
      }),
    ).toBeNull();
    expect(
      retentionRuntimeBudget({
        CLIENTOPS_RETENTION_RUNTIME_VERIFIED: "1",
        CLIENTOPS_RETENTION_MAX_DURATION_SECONDS: "30",
      }),
    ).toBe(25000);
  });
  it("rejects invalid JSON, oversized streamed input and external deadline", async () => {
    verified();
    expect((await handleRetentionSweep(request("{"))).status).toBe(400);
    expect((await handleRetentionSweep(request(" ".repeat(2049)))).status).toBe(413);
    expect((await handleRetentionSweep(request('{"deadlineAt":9999999999999}'))).status).toBe(400);
    expect(seam.batch).not.toHaveBeenCalled();
  });
  it("preserves durable day and sets a bounded server deadline", async () => {
    verified();
    seam.read.mockResolvedValue({ today: "2026-10-02" });
    const now = Date.now();
    expect((await handleRetentionSweep(request("{}"))).status).toBe(200);
    expect(seam.batch).toHaveBeenCalledWith(
      expect.objectContaining({ today: "2026-10-02", limit: 50 }),
    );
    expect(seam.batch.mock.calls[0][0].deadlineAt).toBeLessThanOrEqual(now + 55020);
  });
  it("keeps source-only continuation on the same sweep and token-gated endpoint", async () => {
    const workflow = JSON.parse(
      await readFile("n8n/workflows/clientops-retention-sweep.json", "utf8"),
    );
    const call = workflow.nodes.find((n: { name: string }) => n.name === "Call Retention Sweep");
    expect(call.parameters.jsonBody).toContain("$json.sweepId");
    expect(call.parameters.jsonBody).toContain("$json.nextCursor");
    expect(call.parameters.options.timeout).toBe(65000);
    expect(workflow.connections["Continue Sweep?"].main[0][0].node).toBe("Yield Before Resume");
    expect(workflow.connections["Yield Before Resume"].main[0][0].node).toBe(
      "Call Retention Sweep",
    );
  });
});
