import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootSource = readFileSync(new URL("../__root.tsx", import.meta.url), "utf8");
const readRoute = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

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

  it("keeps approval pending metrics scoped to the active type filter", () => {
    const approvalsSource = readFileSync(new URL("../approvals.tsx", import.meta.url), "utf8");

    expect(approvalsSource).toMatch(/const pendingCount = pending\.length;/);
    expect(approvalsSource).toMatch(
      /const pendingQuoteSends = pending\.filter\(\s*\(a\) => a\.approval_type === "quote_send",?\s*\)\.length;/s,
    );
  });

  it("keeps relationship workspace operational and non-marketing", () => {
    const relationshipSource = readRoute("relationships.tsx");

    expect(relationshipSource).toContain('title="Relationship Command Center"');
    expect(relationshipSource).toContain("getRelationshipSignals");
    expect(relationshipSource).toContain("RelationshipCommandCenter");
    expect(relationshipSource).not.toContain("hero");
    expect(relationshipSource).not.toContain("landing");
  });

  it("adds account 360 without colliding with auth account page", () => {
    const authAccountSource = readRoute("account.tsx");
    const accountsSource = readRoute("accounts.tsx");
    const accountDetailSource = readRoute("accounts.$id.tsx");

    expect(authAccountSource).toContain("AccountView");
    expect(accountsSource).toContain('title="Accounts"');
    expect(accountDetailSource).toContain("Stakeholders");
    expect(accountDetailSource).toContain("AccountTimeline");
  });

  it("keeps account 360 signals actionable and events account-scoped", () => {
    const accountDetailSource = readRoute("accounts.$id.tsx");

    expect(accountDetailSource).toContain("dismissRelationshipSignalFn");
    expect(accountDetailSource).toContain("Dismissal reason");
    expect(accountDetailSource).not.toContain("getCampaigns({})");
    expect(accountDetailSource).not.toContain("Relevant campaigns");
    expect(accountDetailSource).not.toContain("繚");
    expect(accountDetailSource).toContain("const [dismissedSignalIds, setDismissedSignalIds]");
    expect(accountDetailSource).toContain("useEffect(() => {");
    expect(accountDetailSource).toContain("setDismissedSignalIds([]);");
    expect(accountDetailSource).toContain("const openSignals = signals.filter");
  });

  it("adds campaign follow-up workspace", () => {
    const campaignsSource = readRoute("campaigns.tsx");
    const detailSource = readRoute("campaigns.$id.tsx");
    const attendeeTableSource = readFileSync(
      new URL("../../components/relationship/event-attendee-table.tsx", import.meta.url),
      "utf8",
    );

    expect(campaignsSource).toContain('title="Campaigns & Events"');
    expect(campaignsSource).toContain("createCampaign");
    expect(campaignsSource).toContain("setNewCampaignOpen(true)");
    expect(campaignsSource).toContain(
      'navigate({ to: "/campaigns/$id", params: { id: campaign.id } });',
    );
    expect(detailSource).toContain("EventAttendeeTable");
    expect(detailSource).toContain("validateEventImportRowsFn");
    expect(detailSource).toContain('toast.error("No attendee rows found in the CSV.");');
    expect(detailSource).toContain("resetInput();");
    expect(detailSource).toContain(
      'attendee row${result.errors.length === 1 ? "" : "s"} need review before import.',
    );
    expect(detailSource).toContain(
      'attendee row${result.errors.length === 1 ? "" : "s"} failed validation on import.',
    );
    expect(detailSource).toContain("const visibleErrors = errors.slice(0, 6);");
    expect(detailSource).toContain("{`+${errors.length - 6} more`}");
    expect(attendeeTableSource).toContain(
      'member.raw_phone?.trim() ? member.raw_phone : "No phone"',
    );
  });

  it("lets nested workspace child routes render their own pages", () => {
    for (const routeName of [
      "accounts.tsx",
      "campaigns.tsx",
      "clients.tsx",
      "job-sheets.tsx",
      "quotes.tsx",
    ]) {
      const source = readRoute(routeName);

      expect(source).toContain("Outlet");
      expect(source).toContain("useIsExactPath");
    }
  });
});
