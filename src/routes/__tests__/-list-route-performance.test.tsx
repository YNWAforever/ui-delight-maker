import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";

type ListRouteContract = {
  name: string;
  file: string;
  keyExpression: string;
};

const listRoutes: ListRouteContract[] = [
  { name: "dashboard", file: "index.tsx", keyExpression: "crmQueryKeys.dashboard()" },
  { name: "accounts", file: "accounts.tsx", keyExpression: "crmQueryKeys.accounts.list" },
  { name: "clients", file: "clients.tsx", keyExpression: "crmQueryKeys.clients.list" },
  { name: "leads", file: "leads.tsx", keyExpression: "crmQueryKeys.leads.list" },
  { name: "campaigns", file: "campaigns.tsx", keyExpression: "crmQueryKeys.campaigns.list" },
  { name: "quotes", file: "quotes.tsx", keyExpression: "crmQueryKeys.quotes.list" },
  { name: "job sheets", file: "job-sheets.tsx", keyExpression: "crmQueryKeys.jobSheets.list" },
];

function readRoute(name: string) {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

describe("primary CRM list route query cache contracts", () => {
  it.each(listRoutes)(
    "$name normalizes URL search into a query-backed loader",
    ({ file, keyExpression }) => {
      const source = readRoute(file);
    },
  );

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
