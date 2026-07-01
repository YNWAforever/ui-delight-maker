import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthReactAdapter } from "@neondatabase/neon-js/auth/react/adapters";
import { getAuthClientBaseUrl } from "@/lib/auth/neon-auth-url";

let client: ReturnType<typeof createAuthClient> | null = null;

export { getAuthClientBaseUrl };

export function getAuthClient() {
  return (client ??= createAuthClient(getAuthClientBaseUrl(), {
    adapter: BetterAuthReactAdapter(),
  }));
}
