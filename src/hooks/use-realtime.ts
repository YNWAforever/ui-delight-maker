// src/hooks/use-realtime.ts
import { useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";

type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

// Module-level singleton — avoids creating multiple connections
let realtimeClient: ReturnType<typeof createBrowserClient> | null = null;

function getRealtimeClient() {
  if (!realtimeClient) {
    realtimeClient = createBrowserClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    );
  }
  return realtimeClient;
}

export function useRealtime(
  table: string,
  event: RealtimeEvent,
  filter: string | undefined,
  onEvent: () => void,
) {
  // Stable ref so the effect doesn't re-run on every render
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const supabase = getRealtimeClient();
    const channelName = `${table}-${event}-${filter ?? "all"}-${Math.random().toString(36).slice(2, 7)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event, schema: "public", table, ...(filter ? { filter } : {}) },
        () => onEventRef.current(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, event, filter]);
}
