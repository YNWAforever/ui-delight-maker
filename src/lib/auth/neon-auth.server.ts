import { getRequest } from "@tanstack/react-start/server";
import type { Profile } from "@/lib/types";
import {
  getCurrentInvitationForEmail,
  getProfileByEmail,
  getProfileById,
} from "@/server/repositories/profiles";

export type NeonAuthUser = {
  id: string;
  email?: string | null;
  emailVerified?: boolean | null;
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

/**
 * A signed-in caller, carrying both identities this app has for them.
 *
 * `user.id` is the Neon Auth identity — upstream, and only meaningful to the auth provider.
 * `profile.id` is the row in `profiles`, and it is the id every domain column points at:
 * `created_by`, `assigned_to`, `account_owner`, `logged_by`, `notifications.user_id` and the
 * rest are all `references profiles(id)`, and `authorization.server.ts` evaluates scope against
 * `profile.id` too.
 *
 * The two are usually equal, because `acceptInvitation` inserts the profile with the auth user's
 * id. They are not guaranteed to be: `getNeonAuthSession` falls back to matching on email, which
 * resolves a profile that was pre-provisioned (seeded, bootstrapped, or created before the auth
 * account) under a different id. On that path every write keyed by `user.id` violated a foreign
 * key and every notification query matched nothing.
 *
 * **Use `profile.id` for anything the application stores or authorizes.** `user.id` is for
 * talking to Neon Auth.
 */
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
  const primarySession = payload.session;
  const dataSession = payload.data?.session;
  const user =
    payload.user ?? primarySession?.user ?? payload.data?.user ?? dataSession?.user ?? null;

  if (!user?.id) return null;

  const session = {
    id: primarySession?.id ?? dataSession?.id ?? null,
    createdAt: primarySession?.createdAt ?? dataSession?.createdAt ?? null,
    expiresAt: primarySession?.expiresAt ?? dataSession?.expiresAt ?? null,
  };
  if (session.expiresAt) {
    const expiresAt = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  }

  return { user, session };
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

export type WorkspaceAccessDecision =
  | { state: "anonymous" }
  | { state: "active"; session: AppSession }
  | { state: "invited" }
  | { state: "unverified"; email: string }
  | { state: "suspended" }
  | { state: "deactivated" }
  | { state: "no_profile" };

/** Resolve only the current signed-in identity; no arbitrary email input is accepted. */
export async function resolveWorkspaceAccess(): Promise<WorkspaceAccessDecision> {
  const identity = await getNeonAuthIdentity();
  if (!identity) return { state: "anonymous" };

  const normalizedEmail = identity.user.email?.trim().toLowerCase();
  /**
   * The Neon Auth project must require email verification — this is the application-side
   * enforcement. The proxy allows sign-up with any typed @fimmick.com address, so an
   * unverified address must never bind a pre-provisioned profile by email: whoever typed the
   * victim's address would otherwise inherit their workspace identity. A profile matched by
   * `user.id` is already bound (invitation acceptance inserted it with that id) and is
   * unaffected by the upstream verification flag.
   */
  const emailVerified = identity.user.emailVerified === true;
  const profileById = await getProfileById(identity.user.id);
  const profile =
    profileById ??
    (emailVerified && normalizedEmail ? await getProfileByEmail(normalizedEmail) : null);

  if (profile?.status === "suspended") return { state: "suspended" };
  if (profile?.status === "deactivated") return { state: "deactivated" };
  if (profile?.status === "active") {
    if (sessionIsRevoked(identity, profile)) return { state: "anonymous" };
    return { state: "active", session: { ...identity, profile } };
  }

  /**
   * A signed-in identity whose email the upstream has not verified cannot be trusted to be the
   * address it names, so it must not reach any email-keyed state: not the email-fallback profile
   * binding above, and not the pending invitation below (which would otherwise invite it to
   * accept and then fail the repository's verification check). Report the distinct state so the
   * login surface can explain the verification step instead of collapsing into `no_profile`.
   */
  if (!profileById && normalizedEmail && !emailVerified) {
    return { state: "unverified", email: normalizedEmail };
  }

  if (normalizedEmail) {
    const invitation = await getCurrentInvitationForEmail(normalizedEmail);
    if (
      invitation?.status === "pending" &&
      Number.isFinite(Date.parse(invitation.expiresAt)) &&
      Date.parse(invitation.expiresAt) > Date.now()
    ) {
      return { state: "invited" };
    }
  }
  return { state: "no_profile" };
}

export async function getNeonAuthSession(): Promise<AppSession | null> {
  const access = await resolveWorkspaceAccess();
  return access.state === "active" ? access.session : null;
}

export async function requireNeonAuthSession() {
  const session = await getNeonAuthSession();
  if (!session) {
    throw new Error("Authentication required");
  }
  return session;
}
