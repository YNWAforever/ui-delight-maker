import { QueryClient } from "@tanstack/react-query";
import { beforeAll, describe, expect, it, vi } from "vitest";
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
   * Importing a route module pulls its entire component tree — the shared workspace
   * components, every dialog, everything those import in turn. That transform is one-time and
   * shared, but whichever case ran first paid all of it, and the default 5s per-test budget
   * was measuring module loading rather than the thing under test. On a machine where
   * transform and import dominate, the first two cases timed out while the remaining five
   * passed on warm modules — a failure that moved around with scheduling and said nothing
   * about the loaders.
   *
   * So the modules are loaded once here, where the cost belongs and is declared, and the
   * cases keep the tight default timeout. A loader that genuinely hangs still trips it.
   */
  const modules = new Map<string, LoaderRoute>();

  beforeAll(async () => {
    const loaded = await Promise.all(
      listRoutes.map(async (route) => {
        const module = (await import(/* @vite-ignore */ `../${route.module}`)) as {
          Route: LoaderRoute;
        };
        return [route.module, module.Route] as const;
      }),
    );
    for (const [name, route] of loaded) modules.set(name, route);
  }, 120_000);

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

    const routeModule = modules.get(route.module);
    expect(routeModule, `${route.name} route module was not loaded`).toBeDefined();

    const loader = routeModule!.options?.loader;
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
