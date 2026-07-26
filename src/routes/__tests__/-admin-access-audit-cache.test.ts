import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRoute = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("admin overview, access, and audit cache contracts", () => {
  it.each(["admin.index.tsx", "admin.access.tsx", "admin.audit.tsx"])(
    "retains cached loader data in %s",
    (name) => {
      const source = readRoute(name);
      expect(source).toContain("ensureQueryData");
      expect(source).toContain("routeQueryOptions");
      expect(source).toContain("crmQueryKeys.admin");
    },
  );

  it("starts the optional overview audit summary without blocking overview access", () => {
    const source = readRoute("admin.index.tsx");
    expect(source).toContain("Promise.all");
  });

  it("keys access reads independently and removes whole-router invalidation", () => {
    const source = readRoute("admin.access.tsx");
    expect(source).toContain("accessRequestsQueryKey");
    expect(source).toContain("accessUsersQueryKey");
    expect(source).toContain("accessOverridesQueryKey");
    expect(source).toContain("exact: true");
    expect(source).toContain("crmQueryKeys.shell()");
    expect(source).toContain("requesterProfileId");
    expect(source).toContain("teamId");
    expect(source).toContain('scope === "access-requests"');
    expect(source).toContain('crmQueryKeys.admin.section("organization", "directory")');
    expect(source).not.toContain("router.invalidate");
  });

  it("includes every audit filter in the audit query key", () => {
    const source = readRoute("admin.audit.tsx");
    expect(source).toContain("auditFilters(search)");
    expect(source).toContain("crmQueryKeys.admin.list");
    expect(source).toContain("actorProfileId: search.actor");
    expect(source).toContain("targetType: search.targetType");
    expect(source).toContain("targetId: search.target");
    expect(source).toContain("action: search.action");
    expect(source).toContain("severity: search.severity");
    expect(source).toContain("from: search.from");
    expect(source).toContain("to: search.to");
    expect(source).toContain("page: search.page");
  });
});
