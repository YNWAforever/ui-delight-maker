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

export async function triggerN8n(
  config: N8nDispatchConfig,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-workflow-token": config.workflowToken,
    },
    redirect: "error",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `[n8n] webhook trigger failed with ${response.status} ${response.statusText || "response"}`,
    );
  }
}
