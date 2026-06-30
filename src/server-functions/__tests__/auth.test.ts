import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSetResponseHeader, mockGetRequest, createServerFnChain, requestState } = vi.hoisted(
  () => {
    const requestState = { cookie: null as string | null };
    const mockSetResponseHeader = vi.fn();
    const mockGetRequest = vi.fn(() => ({
      headers: {
        get: (name: string) => (name === "cookie" ? requestState.cookie : null),
      },
    }));
    const createServerFnChain = {
      validator() {
        return createServerFnChain;
      },
      handler<T extends (...args: unknown[]) => unknown>(handler: T) {
        return handler;
      },
    };

    return { mockSetResponseHeader, mockGetRequest, createServerFnChain, requestState };
  },
);

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: mockGetRequest,
  setResponseHeader: mockSetResponseHeader,
}));

import { signOut } from "@/server-functions/auth";

const originalEnv = {
  NEON_AUTH_URL: process.env.NEON_AUTH_URL,
  VITE_NEON_AUTH_URL: process.env.VITE_NEON_AUTH_URL,
};

function setCookieRequest(cookie: string | null) {
  requestState.cookie = cookie;
}

function makeResponse(
  body: BodyInit | null,
  init: ResponseInit & { getSetCookie?: () => string[] },
) {
  const response = new Response(body, init);
  if (init.getSetCookie) {
    Object.defineProperty(response.headers, "getSetCookie", {
      value: init.getSetCookie,
    });
  }
  return response;
}

describe("signOut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEON_AUTH_URL = originalEnv.NEON_AUTH_URL;
    process.env.VITE_NEON_AUTH_URL = originalEnv.VITE_NEON_AUTH_URL;
  });

  afterEach(() => {
    process.env.NEON_AUTH_URL = originalEnv.NEON_AUTH_URL;
    process.env.VITE_NEON_AUTH_URL = originalEnv.VITE_NEON_AUTH_URL;
  });

  it("returns success without calling Neon when no cookie is present", async () => {
    setCookieRequest(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(signOut()).resolves.toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockSetResponseHeader).not.toHaveBeenCalled();
  });

  it("forwards sign-out cookies and accepts redirect responses", async () => {
    setCookieRequest("session=abc");
    process.env.NEON_AUTH_URL = "https://auth.example.com";
    const response = makeResponse(null, {
      status: 302,
      headers: {
        location: "/login",
      },
      getSetCookie: () => ["session=; Path=/; Max-Age=0"],
    });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(signOut()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("https://auth.example.com/api/auth/sign-out", {
      method: "POST",
      headers: { cookie: "session=abc" },
      redirect: "manual",
    });
    expect(mockSetResponseHeader).toHaveBeenCalledWith("set-cookie", [
      "session=; Path=/; Max-Age=0",
    ]);
  });

  it("throws the Neon auth error response body when sign-out fails", async () => {
    setCookieRequest("session=abc");
    process.env.NEON_AUTH_URL = "https://auth.example.com";
    const response = makeResponse(JSON.stringify({ message: "Sign-out denied" }), {
      status: 500,
      headers: {
        "content-type": "application/json",
      },
      getSetCookie: () => ["session=; Path=/; Max-Age=0"],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(signOut()).rejects.toThrow("Sign-out denied");
    expect(mockSetResponseHeader).toHaveBeenCalledWith("set-cookie", [
      "session=; Path=/; Max-Age=0",
    ]);
  });

  it("throws a user-facing error when fetch rejects", async () => {
    setCookieRequest("session=abc");
    process.env.NEON_AUTH_URL = "https://auth.example.com";
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));

    await expect(signOut()).rejects.toThrow("Neon Auth sign-out failed");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
