import { queryOptions, type QueryFunction, type QueryKey } from "@tanstack/react-query";
import { CRM_STALE_TIME_MS } from "./performance/query-policy";

type RouteQueryOptions<TQueryFnData, TQueryKey extends QueryKey> = {
  queryKey: TQueryKey;
  queryFn: QueryFunction<TQueryFnData, TQueryKey>;
  staleTime?: number;
};

export function routeQueryOptions<TQueryFnData, TQueryKey extends QueryKey>(
  options: RouteQueryOptions<TQueryFnData, TQueryKey>,
) {
  return queryOptions({
    ...options,
    staleTime: options.staleTime ?? CRM_STALE_TIME_MS,
  });
}
