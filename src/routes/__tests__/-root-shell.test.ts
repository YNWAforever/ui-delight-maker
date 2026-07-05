import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootSource = readFileSync(new URL("../__root.tsx", import.meta.url), "utf8");

describe("root shell hydration", () => {
  it("allows auth UI theme scripts to update the html element before hydration", () => {
    expect(rootSource).toMatch(/<html\b(?=[^>]*\blang="en")(?=[^>]*\bsuppressHydrationWarning\b)/);
  });
});

describe("sales route source copy", () => {
  it("keeps the app on working sales surfaces instead of a marketing landing page", () => {
    const homeSource = readFileSync(new URL("../index.tsx", import.meta.url), "utf8");
    const leadsSource = readFileSync(new URL("../leads.tsx", import.meta.url), "utf8");
    const quotesSource = readFileSync(new URL("../quotes.tsx", import.meta.url), "utf8");
    const clientsSource = readFileSync(new URL("../clients.tsx", import.meta.url), "utf8");

    expect(homeSource).toContain("Revenue Desk");
    expect(leadsSource).toContain("Lead Inbox");
    expect(quotesSource).toContain("Deal Desk");
    expect(clientsSource).toContain("Account 360");
    expect(homeSource).not.toContain("hero");
    expect(homeSource).not.toContain("landing");
  });

  it("keeps the lead empty state useful for filtered and genuinely empty inboxes", () => {
    const leadsSource = readFileSync(new URL("../leads.tsx", import.meta.url), "utf8");

    expect(leadsSource).toContain("hasActiveFilters");
    expect(leadsSource).toContain("setNewOpen(true)");
  });

  it("keeps retention and approval routes on shared sales workspace primitives", () => {
    const renewalsSource = readFileSync(new URL("../renewals.tsx", import.meta.url), "utf8");
    const renewalCardSource = readFileSync(
      new URL("../../components/renewals/renewal-card.tsx", import.meta.url),
      "utf8",
    );
    const renewalsPreviewSource = readFileSync(
      new URL("../../components/renewals/renewals-preview-panel.tsx", import.meta.url),
      "utf8",
    );
    const tasksSource = readFileSync(new URL("../tasks.tsx", import.meta.url), "utf8");
    const approvalsSource = readFileSync(new URL("../approvals.tsx", import.meta.url), "utf8");

    for (const source of [renewalsSource, tasksSource, approvalsSource]) {
      expect(source).toContain("CommandHeader");
      expect(source).toContain("MetricStrip");
      expect(source).toContain("WorkSurfaceEmpty");
    }

    expect(renewalsSource).toContain('title="Renewal Board"');
    expect(renewalsSource).toContain('status="Retain"');
    expect(renewalsSource).toContain("No renewals in this window.");
    expect(renewalsSource).toContain("formatCompactHKD");
    expect(renewalsSource).toContain("annualizeValue");

    expect(renewalCardSource).toContain("formatDate");
    expect(renewalCardSource).toContain("formatCompactHKD");
    expect(renewalCardSource).toContain("annualizeValue");

    expect(renewalsPreviewSource).toContain("formatDate");
    expect(renewalsPreviewSource).toContain("formatCompactHKD");
    expect(renewalsPreviewSource).toContain("annualizeValue");

    expect(tasksSource).toContain('title="Task Queue"');
    expect(tasksSource).toContain('status="Retain"');
    expect(tasksSource).toContain("getTaskBoardMetrics");
    expect(tasksSource).toContain("formatDate");
    expect(tasksSource).toContain("High priority");

    expect(approvalsSource).toContain('title="Approval Desk"');
    expect(approvalsSource).toContain('status="Convert"');
    expect(approvalsSource).toContain("Quote sends");
    expect(approvalsSource).toContain("Decided");
  });
});
