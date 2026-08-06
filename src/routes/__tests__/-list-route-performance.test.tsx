import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";

type ListRouteContract = {
  name: string;
  module: string;
  /** The key the loader must ask the cache for, given `search` below. */
  expectedKey: () => readonly unknown[];
  search: Record<string, unknown>;
};

const LIST_SEARCH = { page: 2, limit: 25 };

const listRoutes: ListRouteContract[] = [
  {
    name: "dashboard",
    module: "index",
    expectedKey: () => crmQueryKeys.dashboard(),
    search: {},
  },
  {
    name: "accounts",
    module: "accounts",
    expectedKey: () => crmQueryKeys.accounts.list(LIST_SEARCH),
    search: LIST_SEARCH,
  },
  {
    name: "clients",
    module: "clients",
    expectedKey: () => crmQueryKeys.clients.list(LIST_SEARCH),
    search: LIST_SEARCH,
  },
  {
    name: "leads",
    module: "leads",
    expectedKey: () => crmQueryKeys.leads.list(LIST_SEARCH),
    search: LIST_SEARCH,
  },
  {
    name: "campaigns",
    module: "campaigns",
    expectedKey: () => crmQueryKeys.campaigns.list(LIST_SEARCH),
    search: LIST_SEARCH,
  },
  {
    name: "quotes",
    module: "quotes",
    expectedKey: () => crmQueryKeys.quotes.list(LIST_SEARCH),
    search: LIST_SEARCH,
  },
  {
    name: "job sheets",
    module: "job-sheets",
    expectedKey: () => crmQueryKeys.jobSheets.list(LIST_SEARCH),
    search: LIST_SEARCH,
  },
];

type LoaderRoute = {
  options?: {
    loader?: (args: {
      context: { queryClient: { ensureQueryData: (options: { queryKey: unknown }) => unknown } };
      deps: { search: Record<string, unknown> };
    }) => unknown;
  };
};

describe("primary CRM list route query cache contracts", () => {
  /**
   * Each list route's loader must prime the cache under the key its own component will read,
   * built through `crmQueryKeys` — otherwise the SSR prefetch is wasted and the page refetches
   * on mount.
   *
   * This runs the loader with a stub queryClient and compares the key it asks for. The previous
   * version read the route file into a variable and asserted nothing at all: seven `it.each`
   * cases that could never fail, and which a hand-built array-literal key would have sailed past.
   */
  it.each(listRoutes)("$name loads through a crmQueryKeys-backed cache entry", async (route) => {
    const requestedKeys: unknown[] = [];
    const queryClient = {
      ensureQueryData: (options: { queryKey: unknown }) => {
        requestedKeys.push(options.queryKey);
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 50 });
      },
    };

    const module = (await import(/* @vite-ignore */ `../${route.module}`)) as {
      Route: LoaderRoute;
    };
    const loader = module.Route.options?.loader;
    expect(loader, `${route.name} route has no loader`).toBeTypeOf("function");

    await loader!({ context: { queryClient }, deps: { search: route.search } });

    expect(requestedKeys).toContainEqual(route.expectedKey());
  });

  it("deduplicates normalized URL filters while the route data is fresh", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const readClients = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });
    const firstKey = crmQueryKeys.clients.list({ page: 1, status: "active", owner: undefined });
    const reorderedKey = crmQueryKeys.clients.list({ status: "active", page: 1 });

    await queryClient.ensureQueryData(
      routeQueryOptions({ queryKey: firstKey, queryFn: readClients }),
    );
    await queryClient.ensureQueryData(
      routeQueryOptions({ queryKey: reorderedKey, queryFn: readClients }),
    );

    expect(firstKey).toEqual(reorderedKey);
    expect(readClients).toHaveBeenCalledOnce();
  });

  it("uses a distinct cache entry when a list URL filter changes", () => {
    const keyFactories = [
      crmQueryKeys.accounts.list,
      crmQueryKeys.clients.list,
      crmQueryKeys.leads.list,
      crmQueryKeys.campaigns.list,
      crmQueryKeys.quotes.list,
      crmQueryKeys.jobSheets.list,
    ];

    for (const list of keyFactories) {
      expect(list({ page: 1, status: "active" })).not.toEqual(
        list({ page: 1, status: "completed" }),
      );
    }
  });
});
