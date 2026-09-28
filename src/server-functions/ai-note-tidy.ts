import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  beginNoteTidyRun,
  finishNoteTidyRun,
  readNoteTidyPolicy,
} from "@/server/repositories/ai-invocations";
import {
  invokeGovernedAI,
  type AIInvocationContext,
} from "@/server/workflows/ai-invocation.server";

const noteInput = z.object({
  notes: z.string().trim().min(1).max(20_000),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
});

export const tidyTouchpointNote = createServerFn({ method: "POST" })
  .validator((data: unknown) => noteInput.parse(data))
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const ctx: AIInvocationContext = {
      actorId: session.profile.id,
      kind: "direct",
      authorize: async () => {
        await requireCapability("engagements.update");
      },
      policy: readNoteTidyPolicy,
      beginRun: beginNoteTidyRun,
      finishRun: finishNoteTidyRun,
      execute: async (input, signal) => {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) throw new Error("OpenRouter is not configured");
        const model = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4-6";
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "Tidy this client touchpoint note into 2-3 clear sentences. Keep all facts, fix grammar, no markdown.",
              },
              { role: "user", content: input },
            ],
          }),
        });
        if (!response.ok) throw new Error("OpenRouter note tidy failed with " + response.status);
        const body = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
            cost?: number;
            currency?: string;
          };
          model?: string;
        };
        const tidied = body.choices?.[0]?.message?.content?.trim();
        if (!tidied) throw new Error("OpenRouter returned no content");
        return {
          output: tidied,
          model: body.model ?? model,
          usage: body.usage
            ? {
                inputTokens: body.usage.prompt_tokens,
                outputTokens: body.usage.completion_tokens,
                totalTokens: body.usage.total_tokens,
                cost: body.usage.cost,
                currency: body.usage.currency,
                source: "openrouter",
              }
            : null,
        };
      },
    };
    const result = await invokeGovernedAI(ctx, {
      workflowType: "note_tidy",
      subjectType: "note",
      subjectId: randomUUID(),
      input: data.notes,
      idempotencyKey: data.idempotencyKey ?? randomUUID(),
    });
    if ((result.outcome === "completed" || result.outcome === "duplicate") && result.output) {
      return { tidied: result.output };
    }
    if (result.outcome === "denied") throw new Error("Note tidy policy is inactive");
    if (result.outcome === "duplicate") throw new Error("Note tidy is already running");
    throw new Error("Note tidy did not complete; review its run before retrying");
  });

export const isAiNoteTidyAvailable = createServerFn({ method: "GET" }).handler(async () => {
  await requireCapability("agents.view");
  await requireNeonAuthSession();
  const policy = await readNoteTidyPolicy();
  return { available: Boolean(process.env.OPENROUTER_API_KEY) && policy.status === "active" };
});
