import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../clients.$id.tsx", import.meta.url), "utf8");

describe("Client workspace loading contract", () => {
  it("loads only the lightweight client read during initial navigation", () => {
    expect(source).toContain(
      "loader: ({ params }) => getClientWorkspaceRead({ data: { clientId: params.id } })",
    );
    for (const legacyRead of [
      "getClient({",
      "getQuotes({",
      "getEngagementsByClient",
      "getClientContacts",
      "getActivityLogsForClient",
      "getJobSheets",
    ]) {
      expect(source).not.toContain(legacyRead);
    }
  });

  it("enables each workspace section only for the tab that needs it", () => {
    expect(source).toMatch(
      /useClientWorkspaceSection\(clientId, "contacts", \{\s*enabled: activeTab === "contacts"/,
    );
    expect(source).toMatch(
      /useClientWorkspaceSection\(clientId, "commercial", \{\s*enabled: activeTab === "quotes"/,
    );
    expect(source).toMatch(
      /useClientWorkspaceSection\(clientId, "engagements", \{\s*enabled: activeTab === "engagements"/,
    );
    expect(source).toMatch(
      /useClientWorkspaceSection\(clientId, "job_sheets", \{\s*enabled: activeTab === "job-sheets"/,
    );
    expect(source).toMatch(
      /useClientWorkspaceSection\(clientId, "activity", \{\s*enabled: activeTab === "timeline"/,
    );
  });

  it("defers tasks and touchpoints until their tabs open", () => {
    expect(source).toMatch(/getTasks[\s\S]*enabled: activeTab === "tasks"/);
    expect(source).toMatch(/getProducts[\s\S]*enabled: activeTab === "engagements"/);
    expect(source).toMatch(/getTouchpointsByClient[\s\S]*enabled: activeTab === "timeline"/);
    expect(source).toContain("contactsQuery.data.staleData?.contacts");
    expect(source).toContain("activityQuery.data.staleData?.activityLogs");
    for (const query of [
      "contactsQuery",
      "commercialQuery",
      "engagementsQuery",
      "jobSheetsQuery",
      "activityQuery",
    ]) {
      expect(source).toContain(query + ".isError");
    }
    expect(source).toContain(
      'commercialQuery.data?.status === "error" && !commercialQuery.data.staleData',
    );
  });
});
