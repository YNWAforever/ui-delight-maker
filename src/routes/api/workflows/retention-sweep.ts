import { createFileRoute } from "@tanstack/react-router";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";
import { z } from "zod";
import {
  runRetentionSweepBatch,
  retentionSweepId,
} from "@/server/workflows/retention-sweep.server";
import { readRetentionSweep } from "@/server/repositories/retention-sweeps";
import { AdminError } from "@/lib/admin/errors";
const requestSchema = z.strictObject({
  sweepId: z.string().uuid().optional(),
  cursor: z.string().uuid().nullable().optional(),
});
export function retentionRuntimeBudget(env: Record<string, string | undefined>) {
  const seconds = Number(env.CLIENTOPS_RETENTION_MAX_DURATION_SECONDS);
  if (
    env.CLIENTOPS_RETENTION_RUNTIME_VERIFIED !== "1" ||
    !Number.isInteger(seconds) ||
    seconds < 30 ||
    seconds > 900
  )
    return null;
  return Math.min(55, seconds - 5) * 1000;
}

export async function handleRetentionSweep(request: Request) {
  assertWorkflowToken(request);
  const startedAt = Date.now(),
    budget = retentionRuntimeBudget(process.env);
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
  const currentDay = new Date().toISOString().slice(0, 10);
  const sweepId = parsed.data.sweepId ?? retentionSweepId(currentDay);
  try {
    const existing = await readRetentionSweep(sweepId);
    const result = await runRetentionSweepBatch({
      sweepId,
      today: existing?.today ?? currentDay,
      cursor: parsed.data.cursor,
      limit: 50,
      deadlineAt: startedAt + budget,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AdminError && error.code === "CONFLICT")
      return Response.json({ ok: false, code: "CONFLICT" }, { status: 409 });
    throw error;
  }
}

export const Route = createFileRoute("/api/workflows/retention-sweep")({
  server: {
    handlers: {
      POST: ({ request }) => handleRetentionSweep(request),
    },
  },
});
