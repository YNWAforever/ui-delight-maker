import { createFileRoute } from "@tanstack/react-router";
import { getNeonAuthCookieHeader, getNeonAuthUrl } from "@/lib/auth/neon-auth.server";

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const REQUEST_HEADERS = ["accept", "authorization", "content-type", "referer", "user-agent"];

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

  headers.set("Origin", new URL(request.url).origin);
  headers.set("x-neon-auth-middleware", "true");
  return headers;
}

export async function proxyNeonAuthRequest({ request, params }: AuthProxyArgs) {
  const path = params._splat ?? "";
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
