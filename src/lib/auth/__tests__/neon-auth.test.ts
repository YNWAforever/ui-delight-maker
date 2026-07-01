import { afterEach, describe, expect, it, vi } from "vitest";

describe("Neon browser auth client config", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses the same-origin auth proxy in the browser", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://clientops.example.com" },
    });
    vi.resetModules();

    const { getAuthClientBaseUrl } = await import("@/lib/auth/neon-auth");

    expect(getAuthClientBaseUrl()).toBe("https://clientops.example.com/api/auth");
  });
});
