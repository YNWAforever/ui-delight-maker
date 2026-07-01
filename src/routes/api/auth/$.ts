import { createFileRoute } from "@tanstack/react-router";
import { getNeonAuthCookieHeader, getNeonAuthUrl } from "@/lib/auth/neon-auth.server";

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const REQUEST_HEADERS = ["accept", "authorization", "content-type", "referer", "user-agent"];
const SIGN_UP_EMAIL_PATH = "sign-up/email";
const SIGN_UP_DOMAIN = "fimmick.com";
const SIGN_UP_DOMAIN_ERROR = "Sign up is only available for @fimmick.com email addresses.";

type AuthProxyArgs = {
  request: Request;
  params: {
    _splat?: string;
  };
};

function getSetCookieHeaders(headers: Headers) {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const cookies = withGetSetCookie.getSetCookie?.();
  if (cookies) return cookies;

  const cookie = headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

function rewriteSetCookie(cookie: string) {
  const [nameValue, ...attributes] = cookie.split(";").map((part) => part.trim());
  const rewrittenAttributes = attributes.filter(
    (attribute) =>
      !/^domain=/i.test(attribute) &&
      !/^path=/i.test(attribute) &&
      !/^samesite=/i.test(attribute) &&
      !/^partitioned$/i.test(attribute),
  );

  return [nameValue, "Path=/", ...rewrittenAttributes, "SameSite=Lax"].join("; ");
}

function getProxyRequestHeaders(request: Request) {
  const headers = new Headers();
  for (const header of REQUEST_HEADERS) {
    const value = request.headers.get(header);
    if (value) headers.set(header, value);
  }

  const cookie = getNeonAuthCookieHeader(request.headers.get("cookie"));
  if (cookie) headers.set("Cookie", cookie);

  // Neon Auth validates relative callbackURL values against the upstream Origin.
  headers.set("Origin", new URL(getNeonAuthUrl()).origin);
  headers.set("x-neon-auth-middleware", "true");
  return headers;
}

function isAllowedSignUpEmail(email: unknown) {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(`@${SIGN_UP_DOMAIN}`);
}

async function validateSignUpRequest(request: Request, path: string) {
  if (request.method !== "POST" || path !== SIGN_UP_EMAIL_PATH) return null;

  const payload = (await request
    .clone()
    .json()
    .catch(() => null)) as { email?: unknown } | null;

  if (isAllowedSignUpEmail(payload?.email)) return null;

  return Response.json(
    { message: SIGN_UP_DOMAIN_ERROR },
    {
      status: 403,
      headers: { "cache-control": "no-store" },
    },
  );
}

export async function proxyNeonAuthRequest({ request, params }: AuthProxyArgs) {
  const path = params._splat ?? "";
  const signUpRejection = await validateSignUpRequest(request, path);
  if (signUpRejection) return signUpRejection;

  const upstreamUrl = new URL(`${getNeonAuthUrl()}/${path}`);
  upstreamUrl.search = new URL(request.url).search;

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: getProxyRequestHeaders(request),
    body: BODYLESS_METHODS.has(request.method) ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });

  const headers = new Headers();
  for (const header of ["content-type", "cache-control", "location"]) {
    const value = upstreamResponse.headers.get(header);
    if (value) headers.set(header, value);
  }

  for (const cookie of getSetCookieHeaders(upstreamResponse.headers)) {
    headers.append("Set-Cookie", rewriteSetCookie(cookie));
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: proxyNeonAuthRequest,
      POST: proxyNeonAuthRequest,
      PUT: proxyNeonAuthRequest,
      PATCH: proxyNeonAuthRequest,
      DELETE: proxyNeonAuthRequest,
    },
  },
});
