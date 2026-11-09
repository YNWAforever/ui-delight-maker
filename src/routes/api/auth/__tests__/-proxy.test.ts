import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxyNeonAuthRequest } from "@/routes/api/auth/$";

const APP_ORIGIN = "https://clientops.example.com";
const originalNeonAuthUrl = process.env.NEON_AUTH_URL;
const originalAppBaseUrl = process.env.APP_BASE_URL;

type AuthRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

function authRequest(path: string, options: AuthRequestOptions = {}) {
  const method = options.method ?? "POST";
  const hasBody = options.body !== undefined && !["GET", "HEAD"].includes(method);
  return new Request(`${APP_ORIGIN}/api/auth/${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
  });
}

function makeSignUpRequest(email: string, headers: Record<string, string> = {}) {
  return authRequest("sign-up/email", {
    headers: {
      origin: APP_ORIGIN,
      referer: `${APP_ORIGIN}/login/sign-up`,
      ...headers,
    },
    body: {
      email,
      password: "correct-password",
      name: "Ada",
    },
  });
}

function upstreamOk() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Neon auth proxy", () => {
  beforeEach(() => {
    process.env.NEON_AUTH_URL = "https://auth.example.com";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (originalNeonAuthUrl === undefined) delete process.env.NEON_AUTH_URL;
    else process.env.NEON_AUTH_URL = originalNeonAuthUrl;
    if (originalAppBaseUrl === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = originalAppBaseUrl;
  });

  it("rejects new user sign-up outside the fimmick.com domain", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamOk());
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

  it("forwards same-origin fimmick.com sign-up requests to Neon Auth", async () => {
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
    // Upstream callbackURL validation needs the Neon Auth origin, not the browser's.
    expect(headers.get("Origin")).toBe("https://auth.example.com");
  });

  it("accepts a same-origin POST delivered through the configured APP_BASE_URL origin", async () => {
    vi.stubEnv("APP_BASE_URL", APP_ORIGIN);
    const fetchMock = vi.fn().mockResolvedValue(upstreamOk());
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: APP_ORIGIN,
      },
      body: JSON.stringify({ email: "ada@fimmick.com", password: "correct-password" }),
    });

    const response = await proxyNeonAuthRequest({ request, params: { _splat: "sign-in/email" } });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["foreign origin", "https://evil.example"],
    ["origin lookalike host", "https://clientops.example.com.evil.example"],
    ["opaque origin", "null"],
  ])("rejects an unsafe request from a %s without contacting Neon Auth", async (_label, origin) => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamOk());
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyNeonAuthRequest({
      request: authRequest("sign-in/email", {
        headers: { origin },
        body: { email: "ada@fimmick.com", password: "correct-password" },
      }),
      params: { _splat: "sign-in/email" },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unsafe request whose only origin signal is a foreign Referer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamOk());
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyNeonAuthRequest({
      request: authRequest("sign-in/email", {
        headers: { referer: "https://evil.example/phish" },
        body: { email: "ada@fimmick.com", password: "correct-password" },
      }),
      params: { _splat: "sign-in/email" },
    });

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects Sec-Fetch-Site: cross-site even without Origin or Referer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamOk());
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyNeonAuthRequest({
      request: authRequest("sign-in/email", {
        headers: { "sec-fetch-site": "cross-site" },
        body: { email: "ada@fimmick.com", password: "correct-password" },
      }),
      params: { _splat: "sign-in/email" },
    });

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects Sec-Fetch-Site: cross-site even when the Origin matches the app", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamOk());
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyNeonAuthRequest({
      request: authRequest("sign-in/email", {
        headers: { origin: APP_ORIGIN, "sec-fetch-site": "cross-site" },
        body: { email: "ada@fimmick.com", password: "correct-password" },
      }),
      params: { _splat: "sign-in/email" },
    });

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows an unsafe request with no browser origin metadata (server-to-server)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamOk());
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyNeonAuthRequest({
      request: authRequest("sign-in/email", {
        body: { email: "ada@fimmick.com", password: "correct-password" },
      }),
      params: { _splat: "sign-in/email" },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not apply the origin check to GET requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamOk());
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyNeonAuthRequest({
      request: authRequest("get-session", {
        method: "GET",
        headers: { origin: "https://evil.example" },
      }),
      params: { _splat: "get-session" },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes relative password-reset redirects to the app origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamOk());
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

  /**
   * A password-reset redirectTo ends up in the mail sent to the account holder, so an
   * off-origin value hands the reset continuation to whoever supplied it. The proxy used to
   * compute that a protocol-relative target was off-origin and then forward it unchanged, and
   * absolute URLs skipped the check entirely.
   */
  it.each([
    ["protocol-relative", "//evil.com/steal"],
    ["absolute", "https://evil.com/steal"],
    ["absolute on a lookalike host", "https://clientops.example.com.evil.com/steal"],
    ["backslash-prefixed", "\\\\evil.com/steal"],
  ])("strips an off-origin password-reset redirect (%s)", async (_label, redirectTo) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://clientops.example.com/api/auth/request-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@fimmick.com", redirectTo }),
    });

    await proxyNeonAuthRequest({ request, params: { _splat: "request-password-reset" } });

    const [, init] = fetchMock.mock.calls[0];
    const forwardedBody = JSON.parse(
      new TextDecoder().decode(await new Response(init?.body).arrayBuffer()),
    );

    expect(forwardedBody).toEqual({ email: "ada@fimmick.com" });
    expect(JSON.stringify(forwardedBody)).not.toContain("evil.com");
  });
});
