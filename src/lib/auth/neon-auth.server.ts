import { getRequest } from "@tanstack/react-start/server";
import type { Profile } from "@/lib/types";
import { getProfileById } from "@/server/repositories/profiles";

export type NeonAuthUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

export type AuthIdentity = {
  user: NeonAuthUser;
  session: {
    id?: string | null;
    createdAt?: string | null;
    expiresAt?: string | null;
  };
};

export type AppSession = AuthIdentity & {
  profile: Profile;
};

type NeonUpstreamSession = {
  id?: string | null;
  user?: NeonAuthUser | null;
  createdAt?: string | null;
  expiresAt?: string | null;
};

type NeonSessionResponse = {
  user?: NeonAuthUser | null;
  session?: NeonUpstreamSession | null;
  data?: {
    user?: NeonAuthUser | null;
    session?: NeonUpstreamSession | null;
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

export async function getNeonAuthIdentity(): Promise<AuthIdentity | null> {
  const request = getRequest();
  const cookie = getNeonAuthCookieHeader(request.headers.get("cookie"));
  const authUrl = getNeonAuthUrl();

  if (!cookie || !authUrl) return null;

  const response = await fetch(`${authUrl}/get-session`, {
    headers: { Cookie: cookie },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 204) return null;
  if (!response.ok) {
    throw new Error(`Neon Auth session lookup failed with status ${response.status}`);
  }

  const payload = (await response.json()) as NeonSessionResponse;
  const upstreamSession = payload.session ?? payload.data?.session ?? null;
  const user =
    payload.user ??
    upstreamSession?.user ??
    payload.data?.user ??
    payload.data?.session?.user ??
    null;

  if (!user?.id) return null;

  return {
    user,
    session: {
      id: upstreamSession?.id ?? null,
      createdAt: upstreamSession?.createdAt ?? null,
      expiresAt: upstreamSession?.expiresAt ?? null,
    },
  };
}

export async function requireNeonAuthIdentity(): Promise<AuthIdentity> {
  const identity = await getNeonAuthIdentity();
  if (!identity) {
    throw new Error("Authentication required");
  }
  return identity;
}

function sessionIsRevoked(identity: AuthIdentity, profile: Profile) {
  if (!profile.session_invalid_before) return false;
  if (!identity.session.createdAt) return true;

  const createdAt = Date.parse(identity.session.createdAt);
  const invalidBefore = Date.parse(profile.session_invalid_before);
  if (!Number.isFinite(createdAt) || !Number.isFinite(invalidBefore)) return true;

  return createdAt < invalidBefore;
}

export async function getNeonAuthSession(): Promise<AppSession | null> {
  const identity = await getNeonAuthIdentity();
  if (!identity) return null;

  const profile = await getProfileById(identity.user.id);
  if (!profile || profile.status !== "active" || sessionIsRevoked(identity, profile)) {
    return null;
  }

  return { ...identity, profile };
}

export async function requireNeonAuthSession() {
  const session = await getNeonAuthSession();
  if (!session) {
    throw new Error("Authentication required");
  }
  return session;
}
