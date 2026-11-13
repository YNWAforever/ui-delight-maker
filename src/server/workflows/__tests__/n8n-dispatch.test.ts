import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { N8nDispatchUncertainError } from "@/lib/n8n";

const trace = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/server/repositories/agent-tool-calls", () => ({ recordToolCallTrace: trace }));
import { dispatchAgentWorkflow } from "../n8n-dispatch.server";
import { n8nTraceArguments } from "../n8n-trace.server";

const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const leadId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const config = {
  webhookUrl: "https://worker.example.test/private-hook",
  workflowToken: "secret-token-canary",
};
const payload = {
  agent_run_id: runId,
  lead_id: leadId,
  workflow_type: "qualify_lead",
  enquiry_text: "private-client-canary",
  email: "private@example.test",
};
const context = { agentRunId: runId, workflowType: "qualify_lead" as const };

beforeEach(() => {
  trace.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("agent n8n dispatch evidence", () => {
  it("records HTTP acceptance with only routing metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(dispatchAgentWorkflow(config, payload, context)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(trace).toHaveBeenCalledTimes(1);
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "n8n_dispatch",
        toolName: "qualify_lead",
        agentRunId: runId,
        status: "ok",
        errorCode: null,
        durationMs: expect.any(Number),
        args: { agent_run_id: runId, workflow_type: "qualify_lead", lead_id: leadId },
      }),
    );
    const evidence = JSON.stringify(trace.mock.calls);
    for (const secret of [
      config.webhookUrl,
      config.workflowToken,
      payload.enquiry_text,
      payload.email,
    ]) {
      expect(evidence).not.toContain(secret);
    }
  });

  it("preserves the uncertain transport error and records a safe outcome", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private-provider-message")));
    await expect(dispatchAgentWorkflow(config, payload, context)).rejects.toBeInstanceOf(
      N8nDispatchUncertainError,
    );
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", errorCode: "dispatch_ambiguous" }),
    );
    expect(JSON.stringify(trace.mock.calls)).not.toContain("private-provider-message");
  });

  it("records a rejected HTTP request without converting it to an ambiguous dispatch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(dispatchAgentWorkflow(config, payload, context)).rejects.toThrow(/503/);
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", errorCode: "provider_error" }),
    );
  });

  it("does not fail or resend an accepted dispatch when tracing throws", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    trace.mockRejectedValue(new Error("private-database-message"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(dispatchAgentWorkflow(config, payload, context)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[n8n] tool-call trace failed", { reason: "Error" });
  });

  it("preserves the original dispatch failure even if tracing also fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    trace.mockRejectedValue(new Error("trace failure"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(dispatchAgentWorkflow(config, payload, context)).rejects.toThrow(/403/);
  });

  it("discards forged metadata and all unapproved argument keys", () => {
    expect(
      n8nTraceArguments("qualify_lead", runId, {
        agent_run_id: "forged",
        workflow_type: "forged",
        lead_id: leadId,
        account_id: "not-a-uuid",
        attempt_id: "not-a-uuid",
        headers: { token: "secret" },
      }),
    ).toEqual({ agent_run_id: runId, workflow_type: "qualify_lead", lead_id: leadId });
  });
});
