import { QueryClient } from "@tanstack/react-query";

export const CRM_STALE_TIME_MS = 30_000;
export const CRM_GC_TIME_MS = 300_000;

const transientNetworkCodes = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN"]);

export function shouldRetryRead(failureCount: number, error: unknown) {
  if (failureCount >= 1) {
    return false;
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const { code, status } = error as { code?: unknown; status?: unknown };
  if (typeof status === "number" && status >= 500) {
    return true;
  }

  return typeof code === "string" && transientNetworkCodes.has(code.toUpperCase());
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
