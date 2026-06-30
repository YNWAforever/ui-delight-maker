// src/lib/__tests__/n8n.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getN8nDispatchConfig, triggerN8n } from "../n8n";

describe("triggerN8n", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.N8N_WORKFLOW_TOKEN = "test-token";
  });

  it("POSTs to the webhook URL with JSON payload and workflow token header", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    await triggerN8n(
      { webhookUrl: "https://example.com/webhook", workflowToken: "test-token" },
      { trigger: "lead.created", lead_id: "123" },
    );

    expect(mockFetch).toHaveBeenCalledWith("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-workflow-token": "test-token",
      },
      redirect: "error",
      body: JSON.stringify({ trigger: "lead.created", lead_id: "123" }),
    });
  });

  it("throws if fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    await expect(
      triggerN8n(
        { webhookUrl: "https://example.com/webhook", workflowToken: "test-token" },
        { trigger: "test" },
      ),
    ).rejects.toThrow("network error");
  });

  it("throws if the webhook responds with a non-2xx status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 502 })));

    await expect(
      triggerN8n(
        { webhookUrl: "https://example.com/webhook", workflowToken: "test-token" },
        { trigger: "test" },
      ),
    ).rejects.toThrow("[n8n] webhook trigger failed with 502");
  });

  it("returns null config when webhook URL or token is missing", () => {
    expect(getN8nDispatchConfig(undefined)).toBeNull();

    delete process.env.N8N_WORKFLOW_TOKEN;
    expect(getN8nDispatchConfig("https://example.com/webhook")).toBeNull();
  });
});
