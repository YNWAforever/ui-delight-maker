import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import { escalateOverdueApprovalsBatch } from "@/server/workflows/approval-sla.server";

/**
 * Runtime verification must be explicit: a scheduled writer that runs longer than the platform
 * allows is worse than one that returns 503, because the post-timeout run may still be applying
 * writes while n8n retries. Same contract as the retention sweep.
 */
export function approvalSlaRuntimeBudget(env: Record<string, string | undefined>): number | null {
  const seconds = Number(env.CLIENTOPS_APPROVAL_SLA_MAX_DURATION_SECONDS);
  if (
    env.CLIENTOPS_APPROVAL_SLA_ENABLED !== "1" ||
    env.CLIENTOPS_APPROVAL_SLA_RUNTIME_VERIFIED !== "1" ||
    !Number.isInteger(seconds) ||
    seconds < 30 ||
    seconds > 900
  )
    return null;
  return Math.min(55, seconds - 5) * 1000;
}

const requestSchema = z.strictObject({
  batchLimit: z.number().int().min(1).max(200).optional(),
});

export async function handleApprovalSla(request: Request) {
  assertWorkflowToken(request);
  const startedAt = Date.now(),
    budget = approvalSlaRuntimeBudget(process.env);
  if (budget === null)
    return Response.json({ ok: false, code: "RUNTIME_NOT_VERIFIED" }, { status: 503 });
  const reader = request.body?.getReader();
  let bytes = 0,
    text = "";
  if (reader) {
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 2048) {
          await reader.cancel();
          return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 413 });
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
  }
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  const result = await escalateOverdueApprovalsBatch({
    limit: parsed.data.batchLimit ?? 50,
    deadlineAt: startedAt + budget,
  });
  return Response.json({ ok: true, ...result });
}

export const Route = createFileRoute("/api/workflows/approval-sla")({
  server: {
    handlers: {
      POST: ({ request }) => handleApprovalSla(request),
    },
  },
});
