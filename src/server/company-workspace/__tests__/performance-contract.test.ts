import { describe, expect, it } from "vitest";
import {
  COMPANY_WORKSPACE_PERFORMANCE_FIXTURES,
  MAX_ENGAGEMENT_QUERIES_PER_WORKSPACE,
  measureCompanyWorkspaceFixture,
} from "../../../../scripts/clientops/measure-company-workspace";

describe("Company Workspace performance contract", () => {
  it("detects the current per-client engagement fan-out against the bounded-query target", () => {
    const measurement = measureCompanyWorkspaceFixture(
      COMPANY_WORKSPACE_PERFORMANCE_FIXTURES.highActivity,
      () => 10,
    );

    expect(measurement.engagementQueryCount).toBe(
      COMPANY_WORKSPACE_PERFORMANCE_FIXTURES.highActivity.clientCount,
    );
    expect(MAX_ENGAGEMENT_QUERIES_PER_WORKSPACE).toBe(1);
    expect(measurement.meetsEngagementQueryTarget).toBe(false);
  });
});
