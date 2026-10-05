import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { Profile, WorkspaceFavorite } from "./lib/types";
import type { AdminNavigationItem, Capability } from "./lib/admin/types";
import { createAppQueryClient, CRM_STALE_TIME_MS } from "./lib/performance/query-policy";
import { RouteErrorBoundary } from "./components/route-error-boundary";
import { RoutePendingState } from "./components/navigation-feedback";

export type RouterContext = {
  queryClient: QueryClient;
  user?: { id: string; email?: string | null; name?: string | null };
  profile?: Profile | null;
  favorites?: WorkspaceFavorite[];
  adminNavigation?: readonly AdminNavigationItem[];
  capabilities?: readonly Capability[];
};

export const getRouter = () => {
  const queryClient = createAppQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: CRM_STALE_TIME_MS,
    // Routes without their own boundary render failures and refusals inside the app shell;
    // the root route keeps its own boundary for failures of the shell itself.
    defaultErrorComponent: RouteErrorBoundary,
    // Shown only once a loader outlasts the router's pending delay; the top progress bar
    // covers the first second.
    defaultPendingComponent: RoutePendingState,
  });

  return router;
};
