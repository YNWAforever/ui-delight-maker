import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getNeonAuthSession } from "@/lib/auth/neon-auth.server";

function getNeonAuthUrl() {
  const url = process.env.NEON_AUTH_URL ?? process.env.VITE_NEON_AUTH_URL;
  if (!url) {
    throw new Error("Missing required env var: NEON_AUTH_URL or VITE_NEON_AUTH_URL");
  }
  return url.replace(/\/$/, "");
}

function forwardSetCookieHeaders(response: Response) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) {
    setResponseHeader("set-cookie", cookies);
  }
}

async function readAuthError(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { message?: string; error?: string };
    return payload.message ?? payload.error ?? fallback;
  }

  const text = await response.text();
  return text || fallback;
}

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  return getNeonAuthSession();
});

export const signIn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { email: string; password: string })
  .handler(async ({ data }) => {
    const response = await fetch(`${getNeonAuthUrl()}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      redirect: "manual",
    });

    forwardSetCookieHeaders(response);

    if (response.ok || (response.status >= 300 && response.status < 400)) {
      return;
    }

    throw new Error(await readAuthError(response, "Neon Auth sign-in failed"));
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const cookie = getRequest().headers.get("cookie");

  if (cookie) {
    try {
      const response = await fetch(`${getNeonAuthUrl()}/api/auth/sign-out`, {
        method: "POST",
        headers: { cookie },
        redirect: "manual",
      });
      forwardSetCookieHeaders(response);
    } catch (error) {
      console.error("[auth] Neon sign-out failed", error);
    }
  }

  return { ok: true } as const;
});
