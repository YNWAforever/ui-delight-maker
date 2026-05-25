// src/hooks/use-realtime.ts
import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase.client";

type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

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
    const supabase = createSupabaseBrowserClient();
    const channelName = `${table}-${event}-${filter ?? "all"}`;

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
