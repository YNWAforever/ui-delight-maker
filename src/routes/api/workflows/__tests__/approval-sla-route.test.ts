import { afterEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => ({ batch: vi.fn(), token: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/server/workflows/assert-workflow-token.server", () => ({
  assertWorkflowToken: seam.token,
}));
vi.mock("@/server/workflows/approval-sla.server", () => ({
  escalateOverdueApprovalsBatch: seam.batch,
}));

import { approvalSlaRuntimeBudget, handleApprovalSla } from "@/routes/api/workflows/approval-sla";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

const request = (body: string) =>
  new Request("https://fixture.invalid/api/workflows/approval-sla", { method: "POST", body });

function verified() {
  vi.stubEnv("CLIENTOPS_APPROVAL_SLA_ENABLED", "1");
  vi.stubEnv("CLIENTOPS_APPROVAL_SLA_RUNTIME_VERIFIED", "1");
  vi.stubEnv("CLIENTOPS_APPROVAL_SLA_MAX_DURATION_SECONDS", "60");
  seam.batch.mockResolvedValue({
    cutoff: "2026-11-12T00:00:00.000Z",
    scanned: 0,
    escalated: 0,
    skipped: 0,
    notified: 0,
    batches: 0,
    complete: true,
  });
}

describe("approval SLA transport and runtime verification", () => {
  it("requires the explicit enable flag and verified duration before any DB work", async () => {
    vi.stubEnv("CLIENTOPS_APPROVAL_SLA_RUNTIME_VERIFIED", "1");
    vi.stubEnv("CLIENTOPS_APPROVAL_SLA_MAX_DURATION_SECONDS", "60");
    expect((await handleApprovalSla(request("{}"))).status).toBe(503);
    expect(seam.token).toHaveBeenCalledTimes(1);
    expect(seam.batch).not.toHaveBeenCalled();

    vi.stubEnv("CLIENTOPS_APPROVAL_SLA_ENABLED", "1");
    vi.stubEnv("CLIENTOPS_APPROVAL_SLA_RUNTIME_VERIFIED", "");
    expect((await handleApprovalSla(request("{}"))).status).toBe(503);
    expect(seam.batch).not.toHaveBeenCalled();
  });

  it("clamps the budget from the declared platform duration", () => {
    expect(
      approvalSlaRuntimeBudget({
        CLIENTOPS_APPROVAL_SLA_ENABLED: "1",
        CLIENTOPS_APPROVAL_SLA_RUNTIME_VERIFIED: "1",
        CLIENTOPS_APPROVAL_SLA_MAX_DURATION_SECONDS: "60",
      }),
    ).toBe(55000);
    expect(
      approvalSlaRuntimeBudget({
        CLIENTOPS_APPROVAL_SLA_ENABLED: "1",
        CLIENTOPS_APPROVAL_SLA_RUNTIME_VERIFIED: "1",
        CLIENTOPS_APPROVAL_SLA_MAX_DURATION_SECONDS: "30",
      }),
    ).toBe(25000);
    for (const seconds of ["29", "901", "29.5", "abc", ""]) {
      expect(
        approvalSlaRuntimeBudget({
          CLIENTOPS_APPROVAL_SLA_ENABLED: "1",
          CLIENTOPS_APPROVAL_SLA_RUNTIME_VERIFIED: "1",
          CLIENTOPS_APPROVAL_SLA_MAX_DURATION_SECONDS: seconds,
        }),
      ).toBeNull();
    }
  });

  it("rejects invalid JSON, oversized streamed input and extra fields", async () => {
    verified();
    expect((await handleApprovalSla(request("{"))).status).toBe(400);
    expect((await handleApprovalSla(request(" ".repeat(2049)))).status).toBe(413);
    expect((await handleApprovalSla(request('{"batchLimit":0}'))).status).toBe(400);
    expect((await handleApprovalSla(request('{"batchLimit":201}'))).status).toBe(400);
    expect((await handleApprovalSla(request('{"unexpected":true}'))).status).toBe(400);
    expect(seam.batch).not.toHaveBeenCalled();
  });

  it("runs a bounded batch with a server-owned deadline", async () => {
    verified();
    const now = Date.now();
    expect((await handleApprovalSla(request("{}"))).status).toBe(200);
    expect(seam.batch).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, deadlineAt: expect.any(Number) }),
    );
    expect(seam.batch.mock.calls[0][0].deadlineAt).toBeGreaterThan(now);
    expect(seam.batch.mock.calls[0][0].deadlineAt).toBeLessThanOrEqual(now + 55020);

    expect((await handleApprovalSla(request('{"batchLimit":7}'))).status).toBe(200);
    expect(seam.batch.mock.calls[1][0].limit).toBe(7);
  });

  it("rejects before doing any work when the workflow token is wrong", async () => {
    verified();
    seam.token.mockImplementation(() => {
      throw new Response("Unauthorized", { status: 401 });
    });
    await expect(Promise.resolve().then(() => handleApprovalSla(request("{}")))).rejects.toSatisfy(
      (error: unknown) => error instanceof Response && error.status === 401,
    );
    expect(seam.batch).not.toHaveBeenCalled();
  });
});
