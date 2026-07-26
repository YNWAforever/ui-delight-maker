import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("approval and notification queue performance", () => {
  it.each([
    ["approvals.tsx", "crmQueryKeys.approvals"],
    ["notifications.tsx", "crmQueryKeys.notifications"],
  ])("loads %s through its route query cache", (file, queryKey) => {
    const source = readSource(file);

    expect(source).toContain("ensureQueryData");
    expect(source).toContain(queryKey);
    expect(source).toContain("routeQueryOptions");
    expect(source).not.toContain("router.invalidate");
  });

  it("keeps the approval type filter in URL search state", () => {
    const source = readSource("approvals.tsx");

    expect(source).toContain("validateSearch:");
    expect(source).toContain("Route.useSearch()");
  });

  it("updates approval list data before exact cache invalidation", () => {
    const source = readSource("approvals.tsx");

    expect(source).toContain("setQueryData<ApprovalRead>");
    expect(source).toContain("invalidateQueries({ queryKey: approvalsQueryKey, exact: true })");
    expect(source).toContain("crmQueryKeys.aiReview.all()");
    expect(source).toContain("previousById");
    expect(source).not.toContain("setQueryData(approvalsQueryKey, previous)");
  });

  it("updates notification data before exact cache invalidation", () => {
    const source = readSource("../hooks/use-notifications.ts");

    expect(source).toContain("setQueryData<NotificationsRead>");
    expect(source).toContain("invalidateQueries({ queryKey: notificationsQueryKey, exact: true })");
    expect(source).toContain("readMutationTokensRef");
    expect(source).toContain("previousById");
    expect(source).not.toContain("setQueryData(notificationsQueryKey, previous)");
  });
});
