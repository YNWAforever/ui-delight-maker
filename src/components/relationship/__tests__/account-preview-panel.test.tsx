// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

// The panel navigates with a router Link instead of a raw anchor, so the destination is
// read off the rendered element the same way every other component test in this tree does.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { AccountPreviewPanel, type AccountPreviewSummary } from "../account-preview-panel";

afterEach(() => cleanup());

const account = (overrides: Partial<AccountPreviewSummary> = {}): AccountPreviewSummary => ({
  id: "a1",
  name: "Acme",
  lifecycleStage: "active_client",
  relationshipHealth: 72,
  lastActivityAt: "2026-07-10T09:00:00Z",
  nextAction: "Renewal review",
  counts: { contacts: 3, clients: 1, engagements: 2, quotes: 4, openSignals: 1 },
  ...overrides,
});

describe("AccountPreviewPanel", () => {
  it("links a selected account to its full workspace", () => {
    render(<AccountPreviewPanel account={account()} open onOpenChange={vi.fn()} />);

    const link = screen.getByRole("link", { name: "Open full workspace" });
    expect(link.getAttribute("href")).toBe("/accounts/a1");
    expect(screen.getByText("Renewal review")).toBeTruthy();
  });

  it("says the counts are unavailable rather than printing zeros for an unknown", () => {
    // A failed overview read used to arrive here as empty arrays, so every company in the
    // tenant was reported as having nothing linked to it.
    render(<AccountPreviewPanel account={account({ counts: null })} open onOpenChange={vi.fn()} />);

    expect(screen.getByText(/counts are unavailable/i)).toBeTruthy();
    expect(screen.queryByText("Quotes")).toBeNull();
  });

  it("locks the favorite star while its write is in flight", () => {
    const onToggleFavorite = vi.fn();

    render(
      <AccountPreviewPanel
        account={account()}
        open
        onOpenChange={vi.fn()}
        onToggleFavorite={onToggleFavorite}
        favoritePending
      />,
    );

    // The favorite write deletes-or-inserts, so two clicks racing net to zero. The second
    // click must not be reachable at all.
    const star = screen.getByRole("button", { name: "Add to favorites" }) as HTMLButtonElement;
    expect(star.disabled).toBe(true);
    star.click();
    expect(onToggleFavorite).not.toHaveBeenCalled();
  });
});
