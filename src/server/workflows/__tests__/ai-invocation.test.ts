import { describe, expect, it, vi } from "vitest";
import { N8nDispatchUncertainError } from "@/lib/n8n";
import { invokeGovernedAI, type AIInvocationContext } from "../ai-invocation.server";

const request = {
  workflowType: "note_tidy" as const,
  subjectType: "note" as const,
  subjectId: "21212121-2121-4121-8121-212121212121",
  input: "A customer follow-up note.",
  idempotencyKey: "note-request-1",
};
function context(overrides: Partial<AIInvocationContext> = {}): AIInvocationContext {
  return {
    actorId: "agent-test-owner",
    kind: "direct",
    authorize: vi.fn().mockResolvedValue(undefined),
    policy: vi.fn().mockResolvedValue({ status: "active", versionId: null }),
    beginRun: vi.fn().mockResolvedValue({ runId: "run-1", created: true }),
    finishRun: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue({ output: "Tidied note." }),
    traceToolCall: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}
describe("governed AI invocation", () => {
  it("does not call the provider or create a run when policy denies", async () => {
    const ctx = context({
      policy: vi.fn().mockResolvedValue({ status: "inactive", versionId: "policy-2" }),
    });
    expect(await invokeGovernedAI(ctx, request)).toMatchObject({ outcome: "denied", runId: null });
    expect(ctx.beginRun).not.toHaveBeenCalled();
    expect(ctx.execute).not.toHaveBeenCalled();
  });
  it("rejects input over 20,000 characters before provider or run creation", async () => {
    const ctx = context();
    await expect(invokeGovernedAI(ctx, { ...request, input: "x".repeat(20_001) })).rejects.toThrow(
      /20,000/,
    );
    expect(ctx.beginRun).not.toHaveBeenCalled();
    expect(ctx.execute).not.toHaveBeenCalled();
  });
  it("records a timeout as failed and leaves an uncertain n8n outcome ambiguous", async () => {
    const ctx = context({
      kind: "n8n",
      deadlineMs: 10,
      execute: vi.fn().mockImplementation(() => new Promise(() => {})),
    });
    const result = await invokeGovernedAI(ctx, request);
    expect(result).toMatchObject({ runId: "run-1", outcome: "ambiguous" });
    expect(ctx.finishRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        status: "failed",
        outcomeCode: "dispatch_ambiguous",
        usage: null,
      }),
    );
  });
  it("records a network-uncertain n8n dispatch as ambiguous", async () => {
    const ctx = context({
      kind: "n8n",
      execute: vi.fn().mockRejectedValue(new N8nDispatchUncertainError(new Error("network reset"))),
    });
    expect(await invokeGovernedAI(ctx, request)).toMatchObject({ outcome: "ambiguous" });
    expect(ctx.finishRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        status: "failed",
        outcomeCode: "dispatch_ambiguous",
      }),
    );
  });

  it("preserves unknown usage as null, never a zero-cost claim", async () => {
    const ctx = context();
    const result = await invokeGovernedAI(ctx, request);
    expect(result.usage).toBeNull();
    expect(ctx.finishRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        status: "completed",
        usage: null,
      }),
    );
  });
  it("returns an existing idempotent run without calling the provider again", async () => {
    const ctx = context({
      beginRun: vi.fn().mockResolvedValue({ runId: "old-run", created: false }),
    });
    expect(await invokeGovernedAI(ctx, request)).toMatchObject({
      runId: "old-run",
      outcome: "duplicate",
    });
    expect(ctx.execute).not.toHaveBeenCalled();
    expect(ctx.finishRun).not.toHaveBeenCalled();
  });
  it("replays an earlier failed same-key run as failed without another provider call", async () => {
    const ctx = context({
      beginRun: vi.fn().mockResolvedValue({
        runId: "failed-run",
        created: false,
        status: "failed",
        outcomeCode: "timeout",
      }),
    });
    expect(await invokeGovernedAI(ctx, request)).toMatchObject({
      runId: "failed-run",
      outcome: "failed",
      reason: "timeout",
    });
    expect(ctx.execute).not.toHaveBeenCalled();
  });

  it("does not relabel a persistence failure as a provider failure", async () => {
    const ctx = context({
      finishRun: vi.fn().mockRejectedValue(new Error("database unavailable")),
    });
    await expect(invokeGovernedAI(ctx, request)).rejects.toThrow("database unavailable");
    expect(ctx.finishRun).toHaveBeenCalledTimes(1);
  });

  it("records only provider-reported token and cost values", async () => {
    const ctx = context({
      execute: vi.fn().mockResolvedValue({
        output: "Tidied note.",
        usage: {
          inputTokens: 17,
          outputTokens: 8,
          totalTokens: 25,
          cost: 0.001,
          currency: "USD",
          source: "openrouter",
        },
      }),
    });
    const result = await invokeGovernedAI(ctx, request);
    expect(result.usage).toEqual({
      inputTokens: 17,
      outputTokens: 8,
      totalTokens: 25,
      cost: 0.001,
      currency: "USD",
      source: "openrouter",
    });
  });
});

describe("governed AI tool-call trace", () => {
  it("records a completed invocation as a governed_ai trace linked to its run", async () => {
    const ctx = context();
    await invokeGovernedAI(ctx, request);

    expect(ctx.traceToolCall).toHaveBeenCalledTimes(1);
    expect(ctx.traceToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "governed_ai",
        toolName: "note_tidy",
        agentRunId: "run-1",
        status: "ok",
        args: request.input,
      }),
    );
    const recorded = (ctx.traceToolCall as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      durationMs: number;
    };
    expect(recorded.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records a provider failure as an error trace with the outcome code", async () => {
    const ctx = context({
      execute: vi.fn().mockRejectedValue(new Error("provider exploded")),
    });
    await invokeGovernedAI(ctx, request);

    expect(ctx.traceToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "governed_ai",
        agentRunId: "run-1",
        status: "error",
        errorCode: "provider_error",
      }),
    );
  });

  it("records an ambiguous n8n dispatch with its outcome code", async () => {
    const ctx = context({
      kind: "n8n",
      execute: vi.fn().mockRejectedValue(new N8nDispatchUncertainError(new Error("network reset"))),
    });
    await invokeGovernedAI(ctx, request);

    expect(ctx.traceToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", errorCode: "dispatch_ambiguous" }),
    );
  });

  it("skips the trace when policy denies or the run is a duplicate", async () => {
    const denied = context({
      policy: vi.fn().mockResolvedValue({ status: "inactive", versionId: null }),
    });
    await invokeGovernedAI(denied, request);
    expect(denied.traceToolCall).not.toHaveBeenCalled();

    const duplicate = context({
      beginRun: vi.fn().mockResolvedValue({ runId: "old-run", created: false }),
    });
    await invokeGovernedAI(duplicate, request);
    expect(duplicate.traceToolCall).not.toHaveBeenCalled();
  });

  it("does not change the AI outcome when the trace writer fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = context({
      traceToolCall: vi.fn().mockRejectedValue(new Error("trace unavailable")),
    });

    const result = await invokeGovernedAI(ctx, request);

    expect(result).toMatchObject({ outcome: "completed", output: "Tidied note." });
    expect(consoleError).toHaveBeenCalled();
  });
});
