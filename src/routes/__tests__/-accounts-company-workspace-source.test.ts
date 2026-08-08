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

  it("blocks on overview errors only when no usable cached overview remains", () => {
    const source = readRoute();

    expect(source).toContain("const hasUsableOverview =");
    expect(source).toContain("const hasOverviewError =");
    expect(source).toContain("if (!hasUsableOverview && hasOverviewError)");
    expect(source).toContain("Showing saved account overview data.");
    expect(source).toContain("onRetry={() => void overviewQuery.refetch()}");
    expect(source).toContain('overviewSection?.status === "empty"');
    expect(source).not.toContain(
      'if (overviewSection?.status === "error" || overviewQuery.isError)',
    );
  });

  it("renders the aggregate open-signal count in both overview labels", () => {
    const source = readRoute();

    expect(source).toContain("getDisplayedOpenSignalCount");
    expect(source).toContain("const displayedOpenSignalCount =");
    expect(source).toContain("value: displayedOpenSignalCount");
    expect(source).toContain("{displayedOpenSignalCount} active");
    expect(source).not.toContain("value: openSignals.length");
    expect(source).not.toContain("{openSignals.length} active");
  });

  it("keeps Tasks quote references and commercial empty summaries independent", () => {
    const source = readRoute();

    expect(source).toContain(
      "const deliveryQuoteSummaries = deliveryFinance?.quoteSummaries ?? []",
    );
    expect(source).toContain("new Map(deliveryQuoteSummaries.map((quote) => [quote.id, quote]))");
    expect(source).not.toContain("new Map(quotes.map((quote) => [quote.id, quote]))");
    expect(source).toMatch(
      /commercialSection\?\.status !== "ready"\s*&&\s*commercialSection\?\.status !== "empty"/,
    );
    expect(source).not.toContain("No commercial data is available for this account yet.");
    expect(source).toContain('<SummaryRow label="Total quotes" value={String(quotes.length)} />');
    expect(source).toContain('label="Active engagements"');
    expect(source).toContain('label="Account ARR"');
  });
});
