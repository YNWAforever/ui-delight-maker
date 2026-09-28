export type N8nDispatchConfig = {
  webhookUrl: string;
  workflowToken: string;
};

export function getN8nDispatchConfig(webhookUrl: string | undefined): N8nDispatchConfig | null {
  const workflowToken = process.env.N8N_WORKFLOW_TOKEN;

  if (!webhookUrl || !workflowToken) {
    return null;
  }

  return { webhookUrl, workflowToken };
}

export class N8nDispatchUncertainError extends Error {
  constructor(cause: unknown) {
    super("[n8n] webhook outcome unknown; review the run before retrying", { cause });
    this.name = "N8nDispatchUncertainError";
  }
}

export function n8nFailureOutcome(error: unknown) {
  return error instanceof N8nDispatchUncertainError
    ? ("dispatch_ambiguous" as const)
    : ("provider_error" as const);
}

export async function triggerN8n(
  config: N8nDispatchConfig,
  payload: Record<string, unknown>,
): Promise<void> {
  const body = JSON.stringify(payload);
  if (body.length > 20_000) throw new Error("n8n payload must be at most 20,000 characters");
  let response: Response;
  try {
    response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-workflow-token": config.workflowToken,
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      body,
    });
  } catch (cause) {
    throw new N8nDispatchUncertainError(cause);
  }

  if (!response.ok) {
    throw new Error(
      `[n8n] webhook trigger failed with ${response.status} ${response.statusText || "response"}`,
    );
  }
}
