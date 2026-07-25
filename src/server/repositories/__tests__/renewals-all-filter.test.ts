import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/neon.server", () => ({
  query: queryMock,
  queryOne: vi.fn(),
  transaction: vi.fn(),
}));

import { listRenewalsRead } from "../engagements";

// What the route actually sends. parseRenewalsInput maps the "all" sentinel to
// undefined and dateOnly() always yields a real date, so this is the shape that
// reaches the repository when /renewals is opened with default filters.
const PRODUCTION_DEFAULTS = {
  renewalWindow: "all",
  risk: undefined,
  productId: undefined,
  asOf: "2026-07-25",
  page: 1,
  limit: 50,
} as Parameters<typeof listRenewalsRead>[0];

describe("listRenewalsRead parameter binding", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
  });

  // The actual production bug: asOf is bound as $1 for both queries, but with the
  // window unfiltered nothing in the items query referenced it, so Postgres failed
  // with "could not determine data type of parameter $1" and the route errored.
  it("keeps $1 referenced when the renewal window is unfiltered", async () => {
    await listRenewalsRead(PRODUCTION_DEFAULTS);

    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("$1");
  });

  it("binds asOf as $1 for the items query", async () => {
    await listRenewalsRead(PRODUCTION_DEFAULTS);

    const values = (queryMock.mock.calls[0]?.[1] ?? []) as unknown[];
    expect(values[0]).toBe("2026-07-25");
  });

  it("still applies real filter values", async () => {
    await listRenewalsRead({
      ...PRODUCTION_DEFAULTS,
      risk: "high",
      productId: "2f1d9d1e-0000-4000-8000-000000000000",
    } as Parameters<typeof listRenewalsRead>[0]);

    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    const values = (queryMock.mock.calls[0]?.[1] ?? []) as unknown[];
    expect(sql).toContain("e.renewal_risk = $");
    expect(sql).toContain("e.product_id = $");
    expect(values).toContain("high");
    expect(values).toContain("2f1d9d1e-0000-4000-8000-000000000000");
  });

  // Hardening. parseRenewalsInput already strips "all" on the route path, and
  // RenewalRisk cannot be "all", so this only covers productId: it is a plain string,
  // and e.product_id is uuid, which Postgres rejects outright.
  it("does not bind the 'all' productId sentinel if a direct caller passes it", async () => {
    await listRenewalsRead({
      ...PRODUCTION_DEFAULTS,
      productId: "all",
    } as Parameters<typeof listRenewalsRead>[0]);

    for (const call of queryMock.mock.calls) {
      expect((call?.[1] ?? []) as unknown[]).not.toContain("all");
    }
  });
});
