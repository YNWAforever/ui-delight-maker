import { requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";

export const tidyTouchpointNote = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { notes: string })
  .handler(async ({ data }) => {
    await requireCapability("engagements.update");
    await requireNeonAuthSession();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const model = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4-6";
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Tidy this client touchpoint note into 2-3 clear sentences. Keep all facts, fix grammar, no markdown.",
          },
          { role: "user", content: data.notes },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter note tidy failed with ${response.status}`);
    }

    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const tidied = body.choices?.[0]?.message?.content?.trim();
    if (!tidied) {
      throw new Error("OpenRouter returned no content");
    }

    return { tidied };
  });

export const isAiNoteTidyAvailable = createServerFn({ method: "GET" }).handler(async () => {
  await requireCapability("agents.view");
  await requireNeonAuthSession();
  return { available: Boolean(process.env.OPENROUTER_API_KEY) };
});
