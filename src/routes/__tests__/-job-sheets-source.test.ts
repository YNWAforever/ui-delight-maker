import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRoute = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const readComponent = (name: string) =>
  readFileSync(new URL(`../../components/job-sheets/${name}`, import.meta.url), "utf8");

describe("job sheet accounting workspace source", () => {
  it("adds a queue route on shared operational CRM primitives", () => {
    const queueSource = readRoute("job-sheets.tsx");

    expect(queueSource).toContain('createFileRoute("/job-sheets")');
    expect(queueSource).toContain("getJobSheets({})");
    expect(queueSource).toContain('title="Accounting Job Sheets"');
    expect(queueSource).toContain("CommandHeader");
    expect(queueSource).toContain("MetricStrip");
    expect(queueSource).toContain("WorkSurfaceEmpty");
    expect(queueSource).not.toContain("hero");
    expect(queueSource).not.toContain("landing");
  });

  it("adds a detail route with billing, acceptance, and manual Xero tracking", () => {
    const detailSource = readRoute("job-sheets.$id.tsx");

    expect(detailSource).toContain('createFileRoute("/job-sheets/$id")');
    expect(detailSource).toContain("getJobSheet({ data: { id: params.id } })");
    expect(detailSource).toContain("updateJobSheetPortions");
    expect(detailSource).toContain("updatePortionXeroReference");
    expect(detailSource).toContain("acceptJobSheetForAccounting");
    expect(detailSource).toContain("canAcceptJobSheet");
    expect(detailSource).toContain("Accepted job sheet commercial fields are immutable");
    expect(detailSource).toContain("Manual Xero references");
  });

  it("adds focused job sheet UI helpers and sidebar navigation", () => {
    const badgeSource = readComponent("job-sheet-status-badge.tsx");
    const tableSource = readComponent("billing-portions-table.tsx");
    const sidebarSource = readFileSync(
      new URL("../../components/app-sidebar.tsx", import.meta.url),
      "utf8",
    );

    expect(badgeSource).toContain("JobSheetStatusBadge");
    expect(tableSource).toContain("BillingPortionsTable");
    expect(tableSource).toContain("getPortionReconciliation");
    expect(sidebarSource).toContain('title: "Job Sheets"');
    expect(sidebarSource).toContain('url: "/job-sheets"');
    expect(sidebarSource).toContain("ClipboardList");
  });
});
