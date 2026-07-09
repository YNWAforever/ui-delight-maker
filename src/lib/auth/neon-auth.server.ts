import { getRequest } from "@tanstack/react-start/server";
import type { Profile } from "@/lib/types";
import { ensureProfileForAuthUser } from "@/server/repositories/profiles";

export type NeonAuthUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

export type AppSession = {
  user: NeonAuthUser;
  profile: Profile;
};

type NeonSessionResponse = {
  user?: NeonAuthUser | null;
  session?: {
    user?: NeonAuthUser | null;
    expiresAt?: string | null;
  } | null;
  data?: {
    user?: NeonAuthUser | null;
    session?: {
      user?: NeonAuthUser | null;
      expiresAt?: string | null;
    } | null;
  } | null;
};

const NEON_AUTH_COOKIE_PREFIX = "__Secure-neon-auth";

export function getNeonAuthUrl() {
  const url = process.env.NEON_AUTH_URL ?? process.env.VITE_NEON_AUTH_URL;
  if (!url) return null;
  return url.replace(/\/$/, "");
}

export function getNeonAuthCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) return "";

  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith(`${NEON_AUTH_COOKIE_PREFIX}.`))
    .join("; ");
}

export async function getNeonAuthSession(): Promise<AppSession | null> {
  const request = getRequest();
  const cookie = getNeonAuthCookieHeader(request.headers.get("cookie"));

  if (!cookie) return null;

  const response = await fetch(`${getNeonAuthUrl()}/get-session`, {
    headers: { Cookie: cookie },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 204) return null;
  if (!response.ok) {
    throw new Error(`Neon Auth session lookup failed with status ${response.status}`);
  }

  const payload = (await response.json()) as NeonSessionResponse;
  const user =
    payload.user ??
    payload.session?.user ??
    payload.data?.user ??
    payload.data?.session?.user ??
    null;

  if (!user?.id) return null;

  const profile = await ensureProfileForAuthUser(user);
  return { user, profile };
}

export async function requireNeonAuthSession() {
  const session = await getNeonAuthSession();
  if (!session) {
    throw new Error("Authentication required");
  }
  return session;
}
