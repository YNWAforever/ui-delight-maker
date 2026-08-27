// @vitest-environment jsdom

import type { ComponentType } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invalidateMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createRootRouteWithContext: () => (options: Record<string, unknown>) => ({ options }),
  Outlet: () => null,
  Link: () => null,
  useRouter: () => ({ invalidate: invalidateMock }),
  useRouterState: () => ({}),
  HeadContent: () => null,
  Scripts: () => null,
  redirect: vi.fn(),
}));
vi.mock("@/server-functions/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/server-functions/app-shell", () => ({ getAppShellRead: vi.fn() }));
vi.mock("@/components/global-search", () => ({ GlobalSearch: () => null }));
vi.mock("@/components/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: () => null,
  SidebarTrigger: () => null,
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));
vi.mock("../../styles.css?url", () => ({ default: "/styles.css" }));

import { Route } from "../__root";

type ErrorBoundaryProps = { error: Error; reset: () => void };

const renderBoundary = (error: Error) => {
  const Boundary = Route.options.errorComponent as ComponentType<ErrorBoundaryProps>;
  return render(<Boundary error={error} reset={() => {}} />);
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the root error boundary never prints what the driver said", () => {
  /**
   * This is the boundary that catches the most: most of the thirty-five routes define no
   * `errorComponent`, so anything they throw lands here. It rendered `{error.message}`
   * verbatim until this test was written.
   */
  it.each([
    'select id, name from public.leads where owner_id = $1 - column "owner_id" does not exist',
    'password authentication failed for user "clientops_rw"',
    "permission denied for table accounts",
    "Connection terminated unexpectedly",
  ])("replaces %s with the generic sentence", (driverMessage) => {
    renderBoundary(new Error(driverMessage));

    const rendered = document.body.textContent ?? "";
    expect(rendered).not.toContain(driverMessage);
    expect(screen.getByText("Something went wrong. Please try again.")).toBeTruthy();
  });

  it("still shows a sentence a person wrote, so real guidance is not thrown away", () => {
    // Blanket-replacing every message would be the easy fix and the wrong one: the server
    // functions throw plenty of messages written for the reader ("Agent is required").
    renderBoundary(new Error("This quote is already approved."));

    expect(screen.getByText("This quote is already approved.")).toBeTruthy();
  });

  it("logs the full error where an engineer can read it", () => {
    // The value is not discarded, only kept off the screen. Losing it entirely would trade
    // one defect for a harder one.
    const error = new Error("permission denied for table accounts");
    renderBoundary(error);

    expect(vi.mocked(console.error)).toHaveBeenCalledWith(error);
  });

  it("offers a way out of the failure", () => {
    renderBoundary(new Error("boom"));

    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go home" }).getAttribute("href")).toBe("/");
  });
});
