import { describe, expect, it, vi } from "vitest";
import { WFM_PLAN } from "../plan.server";
import {
  assertDate,
  listWfm,
  rateLimitedFetch,
  retryAfterMs,
  WfmRateLimiter,
  type Clock,
} from "../http.server";

function fakeClock(start = 0): Clock {
  let now = start;
  return {
    now: () => now,
    async sleep(ms) {
      now += ms;
    },
  };
}

describe("WFM rate limiting", () => {
  it("paces concurrent requests so the 61st starts outside the rolling minute", async () => {
    const clock = fakeClock();
    const limiter = new WfmRateLimiter(clock);
    const starts: number[] = [];
    await Promise.all(
      Array.from({ length: 121 }, async () => {
        await limiter.acquire();
        starts.push(clock.now());
      }),
    );
    expect(starts).toHaveLength(121);
    expect(starts[60] - starts[0]).toBeGreaterThan(60_000);
    for (const start of starts)
      expect(
        starts.filter((time) => time >= start && time < start + 60_000).length,
      ).toBeLessThanOrEqual(60);
  });
  it("honours seconds and HTTP dates, with bounded fallback backoff", () => {
    expect(retryAfterMs("12", 0, 0)).toBe(12_000);
    expect(retryAfterMs("Thu, 01 Jan 1970 00:01:00 GMT", 5_000, 0)).toBe(55_000);
    expect(retryAfterMs("0", 0, 3)).toBe(0);
    expect(retryAfterMs(null, 0, 2)).toBe(4_000);
    expect(retryAfterMs("invalid", 0, 20)).toBe(60_000);
  });
  it("shares cooldown across queued work and counts retries against the limiter", async () => {
    const clock = fakeClock();
    const limiter = new WfmRateLimiter(clock);
    const starts: number[] = [];
    const send = vi.fn(async () => {
      starts.push(clock.now());
      return send.mock.calls.length === 1
        ? new Response(null, { status: 429, headers: { "retry-after": "65" } })
        : new Response("{}", { status: 200 });
    });
    expect((await rateLimitedFetch(send, limiter, clock)).status).toBe(200);
    expect(starts).toEqual([0, 65_000]);
    await limiter.acquire();
    expect(clock.now()).toBe(66_001);
  });
  it("bounds repeated 429s", async () => {
    const clock = fakeClock();
    const send = vi.fn(async () => new Response(null, { status: 429 }));
    expect((await rateLimitedFetch(send, new WfmRateLimiter(clock), clock, 2)).status).toBe(429);
    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe("WFM V2 pagination", () => {
  it("paginates tax settings with the registry's endpoint-specific page size", async () => {
    const get = vi.fn(async (_path: string, params: URLSearchParams) => {
      const page = Number(params.get("page") ?? 1);
      return {
        data: [{ uuid: `tax-${page}` }],
        meta: { pagination: { page, total_pages: 2 } },
      };
    });
    const setting = WFM_PLAN.find((step) => step.type === "setting")!;
    const rows = [];
    for await (const row of listWfm(get, setting.path, setting.options)) rows.push(row.uuid);
    expect(rows).toEqual(["tax-1", "tax-2"]);
    expect(get.mock.calls.map(([, params]) => params.get("page"))).toEqual(["1", "2"]);
    expect(get.mock.calls.every(([, params]) => params.get("pagesize") === "100")).toBe(true);
  });
  it("uses endpoint-specific parameter casing and continues through capped pages", async () => {
    const get = vi.fn(async (_path: string, params: URLSearchParams) => ({
      data: Number(params.get("page")) <= 3 ? [{ uuid: params.get("page") }] : [],
      total: 3,
    }));
    const rows = [];
    for await (const row of listWfm(get, "v2/payments", {
      pageSize: 100,
      pageSizeParam: "pagesize",
      updatedSinceParam: "updatedsince",
      updatedSince: "2025-01-02",
    }))
      rows.push(row.uuid);
    expect(rows).toEqual(["1", "2", "3"]);
    expect(get.mock.calls[0][1].get("updatedsince")).toBe("2025-01-02");
    expect(get.mock.calls[0][1].get("pagesize")).toBe("100");
    expect(get.mock.calls[0][1].has("pageSize")).toBe(false);
  });
  it("reads meta.pagination envelopes and rejects per-page totals that truncate history", async () => {
    const rows = [];
    for await (const row of listWfm(
      async (_path, params) => ({
        data: [{ uuid: params.get("page") }],
        meta: { pagination: { page: Number(params.get("page")), total_pages: 2 } },
      }),
      "v2/jobs",
    ))
      rows.push(row.uuid);
    expect(rows).toEqual(["1", "2"]);
    await expect(async () => {
      for await (const row of listWfm(
        async (_path, params) => ({ data: [{ uuid: params.get("page") }], total: 1 }),
        "v2/jobs",
      ))
        void row;
    }).rejects.toThrow("exceeded declared total");
  });
  it.each([
    [{ data: [], total: 1 }, "Incomplete"],
    [{ data: [{ uuid: "same" }, { uuid: "same" }], total: 2 }, "Duplicate"],
    [{ data: [{}], total: 1 }, "UUID"],
    [{ data: [], total: "0" }, "requires"],
  ])("rejects incomplete or malformed evidence: %j", async (payload, message) => {
    await expect(async () => {
      for await (const row of listWfm(async () => payload, "v2/jobs")) void row;
    }).rejects.toThrow(String(message));
  });
  it("rejects a changing source total", async () => {
    let page = 0;
    await expect(async () => {
      for await (const row of listWfm(
        async () => ({ data: [{ uuid: String(++page) }], total: page === 1 ? 3 : 4 }),
        "v2/jobs",
      ))
        void row;
    }).rejects.toThrow("source changed");
  });
  it("rejects an empty final metadata page after a nonempty page", async () => {
    await expect(async () => {
      for await (const row of listWfm(
        async (_path, params) => ({
          data: params.get("page") === "1" ? [{ uuid: "first" }] : [],
          meta: { pagination: { page: Number(params.get("page")), total_pages: 2 } },
        }),
        "v2/jobs",
      ))
        void row;
    }).rejects.toThrow("Incomplete");
  });
  it.each([0, 1])("accepts empty metadata collections declaring %s pages", async (pages) => {
    const rows = [];
    for await (const row of listWfm(
      async () => ({ data: [], meta: { pagination: { page: 1, total_pages: pages } } }),
      "v2/jobs",
    ))
      rows.push(row);
    expect(rows).toEqual([]);
  });
  it("accepts an empty full collection and unpaginated settings", async () => {
    const rows = [];
    for await (const row of listWfm(async () => ({ data: [], total: 0 }), "v2/jobs"))
      rows.push(row);
    expect(rows).toEqual([]);
    const get = vi.fn(async () => ({ data: [{ uuid: "tax" }], total: 1 }));
    for await (const row of listWfm(get, "v2/taxes", { unpaginated: true })) void row;
    expect(get).toHaveBeenCalledTimes(1);
  });
  it.each(["2025-02-30", "2025-13-01", "2025-2-02", "nonsense"])(
    "rejects invalid dates %s",
    (value) => {
      expect(() => assertDate(value)).toThrow();
    },
  );
});
