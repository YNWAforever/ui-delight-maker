import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

export type QueryMetrics = {
  queryCount: number;
  failedQueryCount: number;
  dbDurationMs: number;
};

const storage = new AsyncLocalStorage<QueryMetrics>();

/** Request-scoped aggregate; SQL text, parameters and row data are never retained. */
export async function withQueryMetrics<T>(
  work: () => Promise<T>,
): Promise<{ value: T; metrics: QueryMetrics }> {
  const metrics: QueryMetrics = { queryCount: 0, failedQueryCount: 0, dbDurationMs: 0 };
  return storage.run(metrics, async () => {
    const value = await work();
    return { value, metrics: { ...metrics } };
  });
}

export async function measureQuery<T>(work: () => Promise<T>): Promise<T> {
  const metrics = storage.getStore();
  if (!metrics) return work();
  const startedAt = performance.now();
  try {
    return await work();
  } catch (error) {
    metrics.failedQueryCount += 1;
    throw error;
  } finally {
    metrics.queryCount += 1;
    metrics.dbDurationMs += performance.now() - startedAt;
  }
}
