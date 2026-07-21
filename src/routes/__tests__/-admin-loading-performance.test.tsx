import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRoute = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const loaderBlock = (source: string) => {
  const start = source.indexOf("loader:");
  const end = source.indexOf("head:", start);
  return source.slice(start, end === -1 ? source.indexOf("component:", start) : end);
};

describe("account and admin loading performance", () => {
  it.each([
    ["account.tsx", "crmQueryKeys.account"],
    ["settings.tsx", "crmQueryKeys.settings"],
    ["admin.index.tsx", "crmQueryKeys.admin"],
    ["admin.people.tsx", "crmQueryKeys.admin"],
    ["admin.people.$id.tsx", "crmQueryKeys.admin"],
    ["admin.teams.tsx", "crmQueryKeys.admin"],
    ["admin.teams.$id.tsx", "crmQueryKeys.admin"],
    ["admin.access.tsx", "crmQueryKeys.admin"],
    ["admin.audit.tsx", "crmQueryKeys.admin"],
  ])("loads %s through the shared query cache", (file, queryKey) => {
    const source = readRoute(file);

    expect(source).toContain("ensureQueryData");
    expect(source).toContain("routeQueryOptions");
    expect(source).toContain(queryKey);
    expect(source).not.toContain("router.invalidate");
  });

  it.each([
    ["admin.index.tsx", "getAdminOverviewFn", "getAdminAuditSummaryFn"],
    ["admin.people.tsx", "getAdminUsersFn", "getAdminUserFn"],
    ["admin.teams.tsx", "getAdminOrganizationFn", "getAdminOrganizationUnitFn"],
    ["admin.teams.$id.tsx", "getAdminOrganizationUnitFn", "getAdminUsersFn"],
    ["admin.access.tsx", "getAdminAccessRequestsFn", "getAdminOverridesFn"],
  ])("starts permitted %s primary reads concurrently", (file, firstRead, secondRead) => {
    const source = readRoute(file);

    expect(source).toContain("Promise.all");
    expect(source).toContain(firstRead);
    expect(source).toContain(secondRead);
  });

  it("keeps reassignment inventory out of the people loader", () => {
    const loader = loaderBlock(readRoute("admin.people.tsx"));
    expect(loader).not.toContain("getAdminReassignmentInventoryFn");
  });
});
