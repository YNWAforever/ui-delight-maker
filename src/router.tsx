import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { Profile, WorkspaceFavorite } from "./lib/types";
import type { AdminNavigationItem } from "./lib/admin/types";

export type RouterContext = {
  queryClient: QueryClient;
  user?: { id: string; email?: string | null; name?: string | null };
  profile?: Profile | null;
  favorites?: WorkspaceFavorite[];
  adminNavigation?: readonly AdminNavigationItem[];
};

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
