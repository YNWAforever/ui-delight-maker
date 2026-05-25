// src/lib/__tests__/n8n.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { triggerN8n } from "../n8n";

describe("triggerN8n", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("POSTs to the webhook URL with JSON payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    await triggerN8n("https://example.com/webhook", { trigger: "lead.created", lead_id: "123" });

    // Allow microtask queue to flush (fire-and-forget)
    await new Promise((r) => setTimeout(r, 0));

    expect(mockFetch).toHaveBeenCalledWith("https://example.com/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "lead.created", lead_id: "123" }),
    });
  });

  it("does not throw if fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    await expect(
      triggerN8n("https://example.com/webhook", { trigger: "test" }),
    ).resolves.toBeUndefined();
  });
});
