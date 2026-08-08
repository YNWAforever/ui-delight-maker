import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRoute = () => readFileSync(new URL("../accounts.$id.tsx", import.meta.url), "utf8");

describe("account company workspace route source", () => {
  it("uses the company workspace read interface for initial loading", () => {
    const source = readRoute();

    expect(source).toContain("getCompanyWorkspace({");
    expect(source).toContain('sections: ["overview"]');
    expect(source).toContain("seedCompanyWorkspaceCache");
    expect(source).not.toContain("getAccount({ data: { id: params.id } })");
    expect(source).not.toContain("linkedClients.map((client)");
    expect(source).not.toContain("getEngagementsByClient");
  });

  it("enables deferred reads only for the active tab", () => {
    const source = readRoute();

    expect(source).toContain('enabled: activeTab === "stakeholders"');
    expect(source).toContain('enabled: activeTab === "timeline" || activeTab === "events"');
    expect(source).toContain('enabled: activeTab === "tasks"');
  });

  it("observes seeded core and overview sections through query options", () => {
    const source = readRoute();

    expect(source).toContain('companyWorkspaceSectionOptions(loaderData.accountId, "core")');
    expect(source).toContain('companyWorkspaceSectionOptions(loaderData.accountId, "overview")');
    expect(source).toContain("coreQuery.data ?? loaderData.sections.core");
    expect(source).toContain("overviewQuery.data ?? loaderData.sections.overview");
  });

  it("keeps overview errors recoverable instead of rendering empty defaults", () => {
    const source = readRoute();

    expect(source).toContain('overviewSection?.status === "error" || overviewQuery.isError');
    expect(source).toContain("onRetry={() => void overviewQuery.refetch()}");
    expect(source).toContain('overviewSection?.status === "empty"');
  });
});
