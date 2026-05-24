// src/lib/supabase.server.ts
import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie } from "@tanstack/react-start/server";

export function createSupabaseServerClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("Missing required env vars: SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  }

  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        const cookies = getCookies();
        return Object.entries(cookies).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          setCookie(name, value, options);
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
