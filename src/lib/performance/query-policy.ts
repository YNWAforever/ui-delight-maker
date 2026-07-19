import { QueryClient } from "@tanstack/react-query";

export const CRM_STALE_TIME_MS = 30_000;
export const CRM_GC_TIME_MS = 300_000;

export function shouldRetryRead(failureCount: number, error: unknown) {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : 0;

  return failureCount < 1 && (status === 0 || status >= 500);
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: CRM_STALE_TIME_MS,
        gcTime: CRM_GC_TIME_MS,
        refetchOnWindowFocus: true,
        retry: shouldRetryRead,
      },
    },
  });
}
