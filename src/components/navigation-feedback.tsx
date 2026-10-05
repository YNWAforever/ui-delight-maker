import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { LoadingSkeleton } from "@/components/sales/states";
import { cn } from "@/lib/utils";
import { workspaceForPath } from "@/lib/workspace-access";

/** Below this a navigation feels instant and a bar would only flicker. */
const PROGRESS_DELAY_MS = 150;

/**
 * A thin bar along the top while the next page's loader runs.
 *
 * Measured on UAT, a cold navigation kept the old page on screen for 2–3.6 s with no signal
 * at all (audit UX-08), so a click looked ignored. The bar appears only after 150 ms, so warm
 * navigations (~100 ms) never show it. It animates a transform only; under
 * `prefers-reduced-motion` it is a still, full-width bar.
 */
export function NavigationProgress() {
  const pending = useRouterState({ select: (state) => state.status === "pending" });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), PROGRESS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-150",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      {visible ? (
        <div
          role="progressbar"
          aria-label="Loading page"
          className="h-full w-1/3 bg-primary animate-nav-progress motion-reduce:w-full motion-reduce:animate-none"
        />
      ) : null}
    </div>
  );
}

/**
 * Moves focus to the new page and says where the user is, after a navigation.
 *
 * Without it focus stayed on the sidebar link that was activated and nothing was announced, so
 * keyboard and screen-reader users had to Tab through the whole rail again (28 stops to the
 * first lead row, audit UX-40). Only a change of pathname counts — filters and tabs change the
 * search string and must leave focus where it is — and the first page load is left to the
 * browser.
 */
export function RouteAnnouncer() {
  const resolvedPath = useRouterState({
    select: (state) => state.resolvedLocation?.pathname ?? null,
  });
  const idle = useRouterState({ select: (state) => state.status === "idle" });
  const previous = useRef<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!idle || resolvedPath === null) return;
    if (previous.current === null) {
      previous.current = resolvedPath;
      return;
    }
    if (previous.current === resolvedPath) return;
    previous.current = resolvedPath;

    const frame = window.requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>("#main-content h1");
      const target = heading ?? document.getElementById("main-content");
      if (!target) return;
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.setAttribute("data-route-focus", "");
      target.focus({ preventScroll: true });
      setMessage(heading?.textContent?.trim() || document.title);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [idle, resolvedPath]);

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}

/**
 * What a slow page shows while its loader runs, once the router's pending delay has passed.
 *
 * Registered as the router's `defaultPendingComponent`; routes with their own pending state
 * (Tasks, Approvals) keep it. A heading-sized bar and a table skeleton approximate every list
 * workspace, which is most of the app.
 */
export function RoutePendingState() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const name = workspaceForPath(pathname)?.title ?? "this page";

  return (
    <div className="space-y-6 px-4 py-6 md:px-6">
      <div className="space-y-2" aria-hidden="true">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-7 w-56 animate-pulse rounded bg-muted" />
      </div>
      <LoadingSkeleton variant="table" rows={8} label={name} />
    </div>
  );
}
