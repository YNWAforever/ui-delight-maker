import { createHash } from "node:crypto";
import { N8nDispatchUncertainError } from "@/lib/n8n";
import { n8nTraceArguments } from "./n8n-trace.server";
import {
  recordToolCallTrace as persistToolCallTrace,
  type ToolCallTraceInput,
} from "@/server/repositories/agent-tool-calls";

export type AIWorkflowType =
  | "qualify_lead"
  | "draft_reply"
  | "draft_quote"
  | "score_renewal_risk"
  | "relationship_intelligence"
  | "note_tidy";
export type AIUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
  currency: string | null;
  source: string | null;
};
type Execution = { output: string | null; usage?: Partial<AIUsage> | null; model?: string | null };
type RunFinish = {
  status: "completed" | "failed";
  outcomeCode: "completed" | "timeout" | "dispatch_ambiguous" | "provider_error";
  output: string | null;
  usage: AIUsage | null;
  model: string | null;
};
export type AIInvocationContext = {
  actorId: string;
  kind: "direct" | "n8n";
  /** The caller supplies an action- and resource-specific authorization check. */
  authorize: () => Promise<void>;
  policy: (workflowType: AIWorkflowType) => Promise<{
    status: "active" | "inactive";
    versionId: string | null;
  }>;
  beginRun: (input: {
    actorId: string;
    workflowType: AIWorkflowType;
    subjectType: string;
    subjectId: string;
    idempotencyKey: string;
    inputLength: number;
    inputFingerprint: string;
    policyVersionId: string | null;
  }) => Promise<{
    runId: string;
    created: boolean;
    output?: string | null;
    status?: string;
    outcomeCode?: string | null;
  }>;
  finishRun: (runId: string, result: RunFinish) => Promise<void>;
  /** For n8n, this invocation owns tracing: execute uses the raw transport, not dispatchAgentWorkflow. */
  execute: (input: unknown, signal: AbortSignal) => Promise<Execution>;
  /**
   * Test seam for the unified B1 trace writer. Defaults to the real repository recorder, which
   * never throws; the invocation catches anyway so a tracing bug can never change an AI outcome.
   */
  traceToolCall?: (input: ToolCallTraceInput) => Promise<unknown>;
  /** Test seam; production remains capped at 15s n8n / 60s direct. */
  deadlineMs?: number;
};
export type AIInvocationRequest = {
  workflowType: AIWorkflowType;
  subjectType: string;
  subjectId: string;
  input: unknown;
  idempotencyKey: string;
};
export type AIInvocationResult = {
  runId: string | null;
  outcome: "denied" | "duplicate" | "completed" | "dispatched" | "failed" | "ambiguous";
  output: string | null;
  usage: AIUsage | null;
  reason?: "timeout" | "provider_error";
};

class InvocationTimeoutError extends Error {
  constructor() {
    super("AI invocation timed out");
  }
}
function nonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
export function normalizeAIUsage(value: Partial<AIUsage> | null | undefined): AIUsage | null {
  if (!value) return null;
  const usage: AIUsage = {
    inputTokens: nonnegative(value.inputTokens),
    outputTokens: nonnegative(value.outputTokens),
    totalTokens: nonnegative(value.totalTokens),
    cost: nonnegative(value.cost),
    currency: typeof value.currency === "string" ? value.currency : null,
    source: typeof value.source === "string" ? value.source : null,
  };
  return Object.values(usage).every((item) => item === null) ? null : usage;
}
async function runWithDeadline<T>(
  execute: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new InvocationTimeoutError());
    }, deadlineMs);
  });
  try {
    return await Promise.race([execute(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Records one governed AI invocation in the unified tool-call trace.
 *
 * The invocation is the agent's tool call here: the workflow type is the tool, the run id links
 * it to `agent_runs`, and the input is digested (never stored) by the recorder. Best-effort:
 * the recorder never throws, and a failing injected seam is swallowed so tracing cannot change
 * the AI outcome.
 */
async function traceInvocation(ctx: AIInvocationContext, input: ToolCallTraceInput): Promise<void> {
  try {
    await (ctx.traceToolCall ?? persistToolCallTrace)(input);
  } catch (error) {
    console.error("[ai] tool-call trace failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}

/** Authorize, check the effective policy, dedupe, run and persist one bounded attempt. */
export async function invokeGovernedAI(
  ctx: AIInvocationContext,
  request: AIInvocationRequest,
): Promise<AIInvocationResult> {
  await ctx.authorize();
  const inputText =
    typeof request.input === "string" ? request.input : JSON.stringify(request.input);
  if (typeof inputText !== "string" || inputText.length > 20_000) {
    throw new Error("AI input must be at most 20,000 characters");
  }
  if (!request.idempotencyKey || request.idempotencyKey.length > 128) {
    throw new Error("AI invocation requires an idempotency key of at most 128 characters");
  }
  const policy = await ctx.policy(request.workflowType);
  if (policy.status !== "active") {
    return { runId: null, outcome: "denied", output: null, usage: null };
  }
  const {
    runId,
    created,
    output: previousOutput,
    status: previousStatus,
    outcomeCode: previousOutcomeCode,
  } = await ctx.beginRun({
    actorId: ctx.actorId,
    workflowType: request.workflowType,
    subjectType: request.subjectType,
    subjectId: request.subjectId,
    idempotencyKey: request.idempotencyKey,
    inputLength: inputText.length,
    inputFingerprint: createHash("sha256").update(inputText).digest("hex"),
    policyVersionId: policy.versionId,
  });
  if (!created) {
    if (previousStatus === "failed") {
      return {
        runId,
        outcome: previousOutcomeCode === "dispatch_ambiguous" ? "ambiguous" : "failed",
        output: null,
        usage: null,
        reason: previousOutcomeCode === "timeout" ? "timeout" : "provider_error",
      };
    }
    return { runId, outcome: "duplicate", output: previousOutput ?? null, usage: null };
  }
  const maximum = ctx.kind === "n8n" ? 15_000 : 60_000;
  const deadlineMs = Math.min(ctx.deadlineMs ?? maximum, maximum);
  const startedAt = Date.now();
  const traceSource = ctx.kind === "n8n" ? "n8n_dispatch" : "governed_ai";
  const traceArgs =
    ctx.kind === "n8n"
      ? n8nTraceArguments(request.workflowType, runId, {
          [`${request.subjectType}_id`]: request.subjectId,
        })
      : request.input;
  let execution: Execution;
  try {
    execution = await runWithDeadline((signal) => ctx.execute(request.input, signal), deadlineMs);
  } catch (error) {
    const timedOut = error instanceof InvocationTimeoutError;
    const ambiguous =
      ctx.kind === "n8n" && (timedOut || error instanceof N8nDispatchUncertainError);
    const outcomeCode = ambiguous ? "dispatch_ambiguous" : timedOut ? "timeout" : "provider_error";
    await ctx.finishRun(runId, {
      status: "failed",
      outcomeCode,
      output: null,
      usage: null,
      model: null,
    });
    await traceInvocation(ctx, {
      source: traceSource,
      toolName: request.workflowType,
      agentRunId: runId,
      status: "error",
      durationMs: Date.now() - startedAt,
      errorCode: outcomeCode,
      args: traceArgs,
    });
    return {
      runId,
      outcome: ambiguous ? "ambiguous" : "failed",
      output: null,
      usage: null,
      reason: timedOut ? "timeout" : "provider_error",
    };
  }
  const usage = normalizeAIUsage(execution.usage);
  if (ctx.kind === "n8n") {
    // HTTP acceptance is a dispatch outcome; the writeback later records workflow completion.
    await traceInvocation(ctx, {
      source: "n8n_dispatch",
      toolName: request.workflowType,
      agentRunId: runId,
      status: "ok",
      durationMs: Date.now() - startedAt,
      args: traceArgs,
    });
    return { runId, outcome: "dispatched", output: null, usage };
  }
  // Persistence errors are not provider failures: do not overwrite the outcome.
  await ctx.finishRun(runId, {
    status: "completed",
    outcomeCode: "completed",
    output: execution.output,
    usage,
    model: execution.model ?? null,
  });
  await traceInvocation(ctx, {
    source: "governed_ai",
    toolName: request.workflowType,
    agentRunId: runId,
    status: "ok",
    durationMs: Date.now() - startedAt,
    args: request.input,
  });
  return { runId, outcome: "completed", output: execution.output, usage };
}
