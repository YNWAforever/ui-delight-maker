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
});
