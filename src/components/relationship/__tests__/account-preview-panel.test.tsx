// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CompanyWorkspaceSummary } from "@/lib/relationship/company-workspace";
import { AccountPreviewPanel } from "../account-preview-panel";

afterEach(() => cleanup());

describe("AccountPreviewPanel", () => {
  it("links a selected account to its full workspace", () => {
    const account: CompanyWorkspaceSummary = {
      id: "a1",
      displayName: "Acme",
      lifecycleLabel: "Client",
      relationshipHealth: 72,
      lastActivityAt: "2026-07-10T09:00:00Z",
      nextAction: "Renewal review",
      primaryContactId: "c1",
      counts: { contacts: 3, clients: 1, leads: 2, openQuotes: 1, openTasks: 4 },
    };

    render(<AccountPreviewPanel account={account} open onOpenChange={vi.fn()} />);

    const link = screen.getByRole("link", { name: "Open full workspace" });
    expect(link.getAttribute("href")).toBe("/accounts/a1");
    expect(screen.getByText("Renewal review")).toBeTruthy();
  });
});
