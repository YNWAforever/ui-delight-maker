export type Clock = { now(): number; sleep(ms: number): Promise<void> };
export const systemClock: Clock = {
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Shared by every request/retry in one client. Pacing avoids rolling-window bursts. */
export class WfmRateLimiter {
  private queue: Promise<void> = Promise.resolve();
  private nextAt = 0;
  constructor(private readonly clock: Clock = systemClock) {}

  defer(ms: number) {
    this.nextAt = Math.max(this.nextAt, this.clock.now() + ms);
  }

  acquire(): Promise<void> {
    const work = this.queue.then(async () => {
      while (this.nextAt > this.clock.now()) {
        await this.clock.sleep(this.nextAt - this.clock.now());
      }
      this.nextAt = this.clock.now() + 1_001;
    });
    this.queue = work.catch(() => {});
    return work;
  }
}

export function retryAfterMs(value: string | null, now: number, attempt: number): number {
  if (value?.trim() && /^\d+(\.\d+)?$/.test(value.trim())) return Number(value) * 1_000;
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? Math.max(0, date - now) : Math.min(60_000, 1_000 * 2 ** attempt);
}

export async function rateLimitedFetch(
  send: () => Promise<Response>,
  limiter: WfmRateLimiter,
  clock: Clock = systemClock,
  maxRetries = 5,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await limiter.acquire();
    const response = await send();
    if (response.status !== 429 || attempt >= maxRetries) return response;
    limiter.defer(retryAfterMs(response.headers.get("retry-after"), clock.now(), attempt));
    await response.body?.cancel();
  }
}

export type WfmObject = Record<string, unknown> & { uuid: string };
export type ListOptions = {
  updatedSince?: string;
  pageSize?: number;
  pageSizeParam?: "pageSize" | "pagesize";
  updatedSinceParam?: "updatedSince" | "updatedsince";
  query?: Record<string, string>;
  unpaginated?: boolean;
};

export function assertDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value).toISOString().slice(0, 10) !== value)
    throw new Error("Expected a real YYYY-MM-DD date");
  return value;
}

/** V2 docs describe both meta.pagination and data/total. Fail on ambiguous truncation. */
export async function* listWfm(
  get: (path: string, params: URLSearchParams) => Promise<unknown>,
  path: string,
  options: ListOptions = {},
): AsyncGenerator<WfmObject> {
  const size = options.pageSize ?? 100;
  if (!Number.isInteger(size) || size < 1 || size > 200) throw new Error("Invalid WFM page size");
  const seen = new Set<string>();
  let expected: number | undefined;
  let expectedPages: number | undefined;
  let envelope: "meta" | "total" | undefined;
  for (let page = 1; ; page++) {
    const params = new URLSearchParams(options.query);
    if (!options.unpaginated) {
      params.set("page", String(page));
      params.set(options.pageSizeParam ?? "pageSize", String(size));
    }
    if (options.updatedSince)
      params.set(options.updatedSinceParam ?? "updatedSince", assertDate(options.updatedSince));
    const payload = await get(path, params);
    if (!payload || typeof payload !== "object") throw new Error("Invalid WFM list envelope");
    const { data, total, meta } = payload as {
      data?: unknown;
      total?: unknown;
      meta?: { pagination?: { page?: number; total_pages?: number } };
    };
    const pagination = meta?.pagination;
    if (!Array.isArray(data)) throw new Error("WFM list requires data[]");
    const currentEnvelope = pagination ? "meta" : "total";
    envelope ??= currentEnvelope;
    if (envelope !== currentEnvelope)
      throw new Error("WFM list envelope changed during pagination");
    if (pagination) {
      const pages = pagination.total_pages;
      if (
        typeof pages !== "number" ||
        !Number.isSafeInteger(pages) ||
        pages < 0 ||
        pagination.page !== page
      )
        throw new Error("Invalid WFM pagination metadata");
      expectedPages ??= pages;
      if (expectedPages !== pages)
        throw new Error("WFM source changed during pagination; rerun snapshot");
    } else {
      if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0)
        throw new Error("WFM list requires a nonnegative total or pagination metadata");
      expected ??= total;
      if (data.length && expected !== total)
        throw new Error("WFM source changed during pagination; rerun snapshot");
    }
    for (const row of data) {
      if (!row || typeof row !== "object" || typeof row.uuid !== "string" || !row.uuid)
        throw new Error("WFM record is missing its UUID");
      if (seen.has(row.uuid)) throw new Error("Duplicate WFM UUID across pages; rerun snapshot");
      seen.add(row.uuid);
      yield row as WfmObject;
    }
    if (pagination) {
      if (expectedPages === 0 && seen.size !== 0)
        throw new Error("WFM zero-page list contains data");
      if (page >= expectedPages!) return;
      if (!data.length || options.unpaginated) throw new Error("Incomplete WFM list response");
    } else {
      if (seen.size > expected!) throw new Error("WFM list exceeded declared total");
      if (!data.length || options.unpaginated) {
        if (seen.size === expected) return;
        throw new Error("Incomplete WFM list response");
      }
      // Probe one trailing page. A per-page total must not masquerade as full history.
    }
    if (page >= 100_000) throw new Error("WFM pagination limit exceeded");
  }
}
