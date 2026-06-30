import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

const DEFAULT_INTERVAL_MS = 12_000;

export function useRoutePollingRefresh(intervalMs = DEFAULT_INTERVAL_MS) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let intervalId: number | null = null;

    const invalidate = () => {
      if (document.visibilityState !== "hidden") {
        void router.invalidate();
      }
    };

    const start = () => {
      if (intervalId != null) return;
      intervalId = window.setInterval(invalidate, intervalMs);
    };

    const stop = () => {
      if (intervalId == null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }

      invalidate();
      start();
    };

    if (document.visibilityState !== "hidden") {
      start();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs, router]);
}
