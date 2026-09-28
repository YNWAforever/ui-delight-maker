// src/lib/__tests__/n8n.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getN8nDispatchConfig, n8nFailureOutcome, triggerN8n } from "../n8n";

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
      signal: expect.any(AbortSignal),
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
    ).rejects.toThrow(/outcome unknown/i);
  });

  it("rejects oversized payloads before dispatch", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    await expect(
      triggerN8n(
        { webhookUrl: "https://example.com/webhook", workflowToken: "test-token" },
        { text: "x".repeat(20_001) },
      ),
    ).rejects.toThrow(/20,000/);
    expect(mockFetch).not.toHaveBeenCalled();
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

  it("classifies uncertain transport separately from a known HTTP rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network reset")));
    const uncertain = await triggerN8n(
      { webhookUrl: "https://example.com/webhook", workflowToken: "test-token" },
      { trigger: "test" },
    ).catch((error: unknown) => error);
    expect(n8nFailureOutcome(uncertain)).toBe("dispatch_ambiguous");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 503 })));
    const rejected = await triggerN8n(
      { webhookUrl: "https://example.com/webhook", workflowToken: "test-token" },
      { trigger: "test" },
    ).catch((error: unknown) => error);
    expect(n8nFailureOutcome(rejected)).toBe("provider_error");
  });

  it("returns null config when webhook URL or token is missing", () => {
    expect(getN8nDispatchConfig(undefined)).toBeNull();

    delete process.env.N8N_WORKFLOW_TOKEN;
    expect(getN8nDispatchConfig("https://example.com/webhook")).toBeNull();
  });
});
