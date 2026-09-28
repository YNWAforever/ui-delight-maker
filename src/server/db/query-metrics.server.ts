import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";

export type QueryMetrics = {
  queryCount: number;
  failedQueryCount: number;
  dbDurationMs: number;
};

const storage = new AsyncLocalStorage<QueryMetrics>();
const requestMetrics = new WeakMap<Request, QueryMetrics>();

function emptyMetrics(): QueryMetrics {
  return { queryCount: 0, failedQueryCount: 0, dbDurationMs: 0 };
}

/** Scoped local diagnostics; no SQL text, values, identity, rows or connection data are retained. */
function currentMetrics(): { metrics: QueryMetrics; expose: boolean } | null {
  const explicit = storage.getStore();
  if (explicit) return { metrics: explicit, expose: false };
  const token = process.env.CLIENTOPS_PERF_TOKEN;
  if (!token) return null;
  try {
    const request = getRequest();
    if (request.headers.get("x-clientops-perf-token") !== token) return null;
    let metrics = requestMetrics.get(request);
    if (!metrics) {
      metrics = emptyMetrics();
      requestMetrics.set(request, metrics);
    }
    return { metrics, expose: true };
  } catch {
    return null;
  }
}

/** Isolated asynchronous operation scope for direct repository measurements and tests. */
export async function withQueryMetrics<T>(
  work: () => Promise<T>,
): Promise<{ value: T; metrics: QueryMetrics }> {
  const metrics = emptyMetrics();
  return storage.run(metrics, async () => {
    const value = await work();
    return { value, metrics: { ...metrics } };
  });
}

export async function measureQuery<T>(work: () => Promise<T>): Promise<T> {
  const capture = currentMetrics();
  if (!capture) return work();
  const startedAt = performance.now();
  try {
    return await work();
  } catch (error) {
    capture.metrics.failedQueryCount += 1;
    throw error;
  } finally {
    capture.metrics.queryCount += 1;
    capture.metrics.dbDurationMs += performance.now() - startedAt;
    if (capture.expose) {
      try {
        setResponseHeader("x-clientops-db-scope", "http-request");
        setResponseHeader("x-clientops-db-count", String(capture.metrics.queryCount));
        setResponseHeader("x-clientops-db-failed", String(capture.metrics.failedQueryCount));
        setResponseHeader("x-clientops-db-duration-ms", capture.metrics.dbDurationMs.toFixed(3));
      } catch {
        // Diagnostics must not change query behavior when response headers are unavailable.
      }
    }
  }
}
