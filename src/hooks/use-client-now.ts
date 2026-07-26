import { useEffect, useState } from "react";

/**
 * The current time, but only after the component has mounted.
 *
 * Returns null on the server and on the first client render, so both produce identical
 * markup and hydration stays clean. Callers render an absolute timestamp (or nothing)
 * until it resolves, then a live relative one.
 *
 * Ticks every 30s so an SLA countdown or "2m ago" does not sit stale on an open tab.
 */
export function useClientNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
