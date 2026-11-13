import {
  recordToolCallTrace,
  type ToolCallTraceInput,
} from "@/server/repositories/agent-tool-calls";

/** Only routing metadata is traced. Webhook URLs, tokens and model content never enter evidence. */
export function n8nTraceArguments(
  workflowType: string,
  agentRunId: string,
  payload: unknown,
): Record<string, unknown> {
  const metadata =
    payload !== null && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const args: Record<string, unknown> = {
    workflow_type: workflowType,
    agent_run_id: agentRunId,
  };
  for (const key of ["lead_id", "account_id", "engagement_id", "attempt_id"]) {
    const value = metadata[key];
    if (
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ) {
      args[key] = value;
    }
  }
  return args;
}

/** A broken telemetry seam must never turn an accepted dispatch/callback into a retry. */
export async function recordN8nTrace(input: ToolCallTraceInput): Promise<void> {
  try {
    await recordToolCallTrace(input);
  } catch (error) {
    console.error("[n8n] tool-call trace failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}
