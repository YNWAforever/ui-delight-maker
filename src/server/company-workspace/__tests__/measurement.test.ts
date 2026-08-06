import { describe, expect, it } from "vitest";
import {
  COMPANY_WORKSPACE_PERFORMANCE_FIXTURES,
  measureCompanyWorkspaceComparison,
} from "../../../../scripts/clientops/measure-company-workspace";

describe("Company Workspace optimized fixture measurements", () => {
  it.each([
    COMPANY_WORKSPACE_PERFORMANCE_FIXTURES.empty,
    COMPANY_WORKSPACE_PERFORMANCE_FIXTURES.typical,
    COMPANY_WORKSPACE_PERFORMANCE_FIXTURES.highActivity,
  ])("reduces initial work for the $name fixture", (fixture) => {
    const { baseline, optimized } = measureCompanyWorkspaceComparison(fixture);

    expect(optimized.serverCallCount).toBe(1);
    expect(optimized.databaseQueryCount).toBe(5);
    expect(optimized.engagementQueryCount).toBe(0);
    expect(optimized.elapsedDurationMs).toBeNull();
  });

  it.each([
    COMPANY_WORKSPACE_PERFORMANCE_FIXTURES.typical,
    COMPANY_WORKSPACE_PERFORMANCE_FIXTURES.highActivity,
  ])("reduces representative initial payload bytes for $name", (fixture) => {
    const { baseline, optimized } = measureCompanyWorkspaceComparison(fixture);

    // This case had its assertion removed at some point and sat green ever since, which is
    // exactly the regression it exists to catch: eagerly embedding rows in the overview
    // response re-inflates the initial payload without failing anything.
    expect(optimized.responseBytes).toBeLessThan(baseline.responseBytes);
  });
  it("keeps commercial engagement loading bounded when that tab is opened", () => {
    const { optimizedCommercial } = measureCompanyWorkspaceComparison(
      COMPANY_WORKSPACE_PERFORMANCE_FIXTURES.highActivity,
    );

    expect(optimizedCommercial.serverCallCount).toBe(1);
    expect(optimizedCommercial.databaseQueryCount).toBe(4);
    expect(optimizedCommercial.engagementQueryCount).toBe(1);
  });
});
