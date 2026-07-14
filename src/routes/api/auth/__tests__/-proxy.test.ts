import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxyNeonAuthRequest } from "@/routes/api/auth/$";

const originalNeonAuthUrl = process.env.NEON_AUTH_URL;

function makeSignUpRequest(email: string) {
  return new Request("https://clientops.example.com/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://ui-delight-maker.vercel.app",
      referer: "https://ui-delight-maker.vercel.app/login/sign-up",
    },
    body: JSON.stringify({
      email,
      password: "correct-password",
      name: "Ada",
    }),
  });
}

describe("Neon auth proxy", () => {
  beforeEach(() => {
    process.env.NEON_AUTH_URL = "https://auth.example.com";
  });

  afterEach(() => {
    process.env.NEON_AUTH_URL = originalNeonAuthUrl;
    vi.unstubAllGlobals();
  });

  it("rejects new user sign-up outside the fimmick.com domain", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyNeonAuthRequest({
      request: makeSignUpRequest("ada@example.com"),
      params: { _splat: "sign-up/email" },
    });

    await expect(response.json()).resolves.toEqual({
      message: "Sign up is only available for @fimmick.com email addresses.",
    });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards fimmick.com sign-up requests to Neon Auth", async () => {
    const upstreamResponse = new Response(null, { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse);
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyNeonAuthRequest({
      request: makeSignUpRequest("Ada@FIMMICK.com"),
      params: { _splat: "sign-up/email" },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://auth.example.com/sign-up/email"), {
      method: "POST",
      headers: expect.any(Headers),
      body: expect.any(ArrayBuffer),
      redirect: "manual",
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Headers;
    expect(headers.get("Origin")).toBe("https://auth.example.com");
  });
  it("normalizes relative password-reset redirects to the app origin", async () => {
    const upstreamResponse = new Response(null, { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse);
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://clientops.example.com/api/auth/request-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "ada@fimmick.com",
        redirectTo: "/login/reset-password",
      }),
    });

    await proxyNeonAuthRequest({
      request,
      params: { _splat: "request-password-reset" },
    });

    const [, init] = fetchMock.mock.calls[0];
    const forwardedBody = JSON.parse(
      new TextDecoder().decode(await new Response(init?.body).arrayBuffer()),
    );
    const headers = init?.headers as Headers;

    expect(forwardedBody).toEqual({
      email: "ada@fimmick.com",
      redirectTo: "https://clientops.example.com/login/reset-password",
    });
    expect(headers.get("Origin")).toBe("https://auth.example.com");
  });
});
