import { describe, expect, it } from "vitest";
import { crmQueryKeys } from "../query-keys";
import { routeQueryOptions } from "../route-query";

describe("CRM query keys", () => {
  it("creates stable keys for shell, route details, and workspace sections", () => {
    expect(crmQueryKeys.shell()).toEqual(["shell"]);
    expect(crmQueryKeys.dashboard()).toEqual(["dashboard"]);
    expect(crmQueryKeys.clients.detail("c1")).toEqual(["clients", "detail", "c1"]);
    expect(crmQueryKeys.companyWorkspace.section("a1", "activity")).toEqual([
      "company-workspace",
      "a1",
      "activity",
    ]);
  });

  it("normalizes list filters so property order cannot duplicate a cache entry", () => {
    expect(crmQueryKeys.quotes.list({ status: "sent", ownerId: "u1" })).toEqual([
      "quotes",
      "list",
      { ownerId: "u1", status: "sent" },
    ]);
    expect(crmQueryKeys.quotes.list({ ownerId: "u1", status: "sent" })).toEqual(
      crmQueryKeys.quotes.list({ status: "sent", ownerId: "u1" }),
    );
  });
});

describe("route query options", () => {
  it("keeps a route query key and function together", async () => {
    const queryFn = () => Promise.resolve("ready");
    const options = routeQueryOptions({
      queryKey: crmQueryKeys.clients.detail("c1"),
      queryFn,
    });

    expect(options.queryKey).toEqual(["clients", "detail", "c1"]);
    expect(options.queryFn).toBe(queryFn);
  });
});
