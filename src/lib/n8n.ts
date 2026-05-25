// src/lib/n8n.ts
export async function triggerN8n(webhookUrl: string, payload: object): Promise<void> {
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => console.error("[n8n] webhook trigger failed:", err));
}
