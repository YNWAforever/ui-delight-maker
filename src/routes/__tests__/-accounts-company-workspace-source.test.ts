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
});
