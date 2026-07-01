import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthReactAdapter } from "@neondatabase/neon-js/auth/react/adapters";

let client: ReturnType<typeof createAuthClient> | null = null;

export function getAuthClientBaseUrl() {
  if (typeof window !== "undefined") {
    return new URL("/api/auth", window.location.origin).toString();
  }

  const appBaseUrl = typeof process !== "undefined" ? process.env.APP_BASE_URL : undefined;
  return new URL("/api/auth", appBaseUrl ?? "http://localhost:5173").toString();
}

export function getAuthClient() {
  return (client ??= createAuthClient(getAuthClientBaseUrl(), {
    adapter: BetterAuthReactAdapter(),
  }));
}
