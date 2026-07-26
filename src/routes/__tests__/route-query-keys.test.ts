import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { crmQueryKeys } from "@/lib/query-keys";

/**
 * Replaces grep assertions that checked a route's *source* mentioned a query key, e.g.
 * expect(source).toContain("crmQueryKeys.leads.detail").
 *
 * Those asserted a string was present. These assert what that was standing in for: a
 * loader seeds the cache under a key and the component reads it back under the same key,
 * so if the key shape drifts the loader's work is silently discarded and the route
 * double-fetches on every visit.
 *
 * Deliberately absent: assertions that filter key order and undefined filters produce a
 * stable key. `normalizeQueryFilters` sorts keys and strips undefined, but react-query
 * hashes keys with JSON.stringify over sorted object keys, which already normalises both.
 * Those properties therefore have no observable behaviour to assert — removing the sort
 * from query-keys.ts leaves every test here passing. A test that cannot fail is worse than
 * no test, so they are not written rather than written vacuously.
 */
describe("crm query keys", () => {
  it("keeps detail and list entries separate", () => {
    const client = new QueryClient();
    client.setQueryData(crmQueryKeys.leads.detail("lead-1"), { id: "lead-1" });

    expect(client.getQueryData(crmQueryKeys.leads.list({}))).toBeUndefined();
    expect(client.getQueryData(crmQueryKeys.leads.detail("lead-1"))).toEqual({ id: "lead-1" });
  });

  it("keeps one record's sections separate from another's", () => {
    const client = new QueryClient();
    client.setQueryData(crmQueryKeys.clients.section("client-1", "quotes"), ["q1"]);

    expect(client.getQueryData(crmQueryKeys.clients.section("client-2", "quotes"))).toBeUndefined();
    expect(
      client.getQueryData(crmQueryKeys.clients.section("client-1", "job_sheets")),
    ).toBeUndefined();
    expect(client.getQueryData(crmQueryKeys.clients.section("client-1", "quotes"))).toEqual(["q1"]);
  });

  it("invalidates a whole domain without evicting another", async () => {
    // Mutations invalidate by domain root. If detail keys did not nest under it the
    // invalidation would silently miss them, leaving the screen on stale data after a save.
    const client = new QueryClient();
    client.setQueryData(crmQueryKeys.leads.detail("lead-1"), { id: "lead-1" });
    client.setQueryData(crmQueryKeys.quotes.detail("quote-1"), { id: "quote-1" });

    await client.invalidateQueries({ queryKey: crmQueryKeys.leads.all() });

    expect(client.getQueryState(crmQueryKeys.leads.detail("lead-1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(crmQueryKeys.quotes.detail("quote-1"))?.isInvalidated).toBe(false);
  });
});
