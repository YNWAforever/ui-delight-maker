import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { Profile, WorkspaceFavorite } from "./lib/types";
import type { AdminNavigationItem } from "./lib/admin/types";
import { createAppQueryClient, CRM_STALE_TIME_MS } from "./lib/performance/query-policy";

export type RouterContext = {
  queryClient: QueryClient;
  user?: { id: string; email?: string | null; name?: string | null };
  profile?: Profile | null;
  favorites?: WorkspaceFavorite[];
  adminNavigation?: readonly AdminNavigationItem[];
};

export const getRouter = () => {
  const queryClient = createAppQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: CRM_STALE_TIME_MS,
  });

  return router;
};
