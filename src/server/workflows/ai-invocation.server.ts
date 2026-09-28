import { createHash } from "node:crypto";
import { N8nDispatchUncertainError } from "@/lib/n8n";

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
  execute: (input: unknown, signal: AbortSignal) => Promise<Execution>;
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
  let execution: Execution;
  try {
    execution = await runWithDeadline((signal) => ctx.execute(request.input, signal), deadlineMs);
  } catch (error) {
    const timedOut = error instanceof InvocationTimeoutError;
    const ambiguous =
      ctx.kind === "n8n" && (timedOut || error instanceof N8nDispatchUncertainError);
    await ctx.finishRun(runId, {
      status: "failed",
      outcomeCode: ambiguous ? "dispatch_ambiguous" : timedOut ? "timeout" : "provider_error",
      output: null,
      usage: null,
      model: null,
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
  return { runId, outcome: "completed", output: execution.output, usage };
}
