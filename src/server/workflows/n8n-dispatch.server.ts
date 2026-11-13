import { n8nFailureOutcome, triggerN8n, type N8nDispatchConfig } from "@/lib/n8n";
import type { AgentWorkflowType } from "@/lib/agents";
import { n8nTraceArguments, recordN8nTrace } from "./n8n-trace.server";

/**
 * Records the CRM's HTTP dispatch attempt, not completion of the external workflow.
 * Call only after authorization/policy checks and creation of a new run. Invitation emails
 * use triggerN8n directly because they are not agent runs.
 */
export async function dispatchAgentWorkflow(
  config: N8nDispatchConfig,
  payload: Record<string, unknown>,
  context: { agentRunId: string; workflowType: AgentWorkflowType },
): Promise<void> {
  const startedAt = Date.now();
  let errorCode: "dispatch_ambiguous" | "provider_error" | null = null;
  try {
    await triggerN8n(config, payload);
  } catch (error) {
    errorCode = n8nFailureOutcome(error);
    throw error;
  } finally {
    await recordN8nTrace({
      source: "n8n_dispatch",
      toolName: context.workflowType,
      agentRunId: context.agentRunId,
      status: errorCode ? "error" : "ok",
      errorCode,
      durationMs: Date.now() - startedAt,
      args: n8nTraceArguments(context.workflowType, context.agentRunId, payload),
    });
  }
}
