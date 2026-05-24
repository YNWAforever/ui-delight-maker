// src/lib/supabase.server.ts
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { appendResponseHeader, getWebRequest } from "@tanstack/react-start/server";

export function createSupabaseServerClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("Missing required env vars: SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  }

  const request = getWebRequest();

  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          appendResponseHeader("Set-Cookie", serializeCookieHeader(name, value, options));
        });
      },
    },
  });
}

export function createSupabaseServiceClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
