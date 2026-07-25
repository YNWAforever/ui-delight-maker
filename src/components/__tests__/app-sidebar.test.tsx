// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => "/",
  Link: ({ to, children, ...props }: ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { AppSidebar } from "../app-sidebar";

afterEach(() => cleanup());

describe("AppSidebar", () => {
  it("renders personal favorites and labels the Account route Accounts", () => {
    render(
      <SidebarProvider>
        <AppSidebar
          profile={{
            id: "profile-1",
            email: "ada@example.com",
            name: "Ada",
            role: "sales",
            status: "active",
            avatar_url: null,
            job_title: null,
            phone: null,
            locale: "en-HK",
            timezone: "Asia/Hong_Kong",
            primary_department_id: null,
            manager_profile_id: null,
            last_active_at: null,
            session_invalid_before: null,
            suspended_at: null,
            suspended_by: null,
            suspension_reason: null,
            deactivated_at: null,
            deactivated_by: null,
            deactivation_reason: null,
            availability_status: "available",
            leave_starts_at: null,
            leave_ends_at: null,
            created_at: "2026-01-01T00:00:00Z",
          }}
          onSignOut={vi.fn()}
          favorites={[{ id: "f1", label: "At-risk accounts", href: "/accounts?view=at-risk" }]}
        />
      </SidebarProvider>,
    );

    expect(screen.getByRole("link", { name: "Accounts" }).getAttribute("href")).toBe("/accounts");
    expect(screen.getByRole("link", { name: "Active Clients" }).getAttribute("href")).toBe(
      "/clients",
    );
    expect(screen.getByRole("link", { name: "At-risk accounts" }).getAttribute("href")).toBe(
      "/accounts?view=at-risk",
    );
  });

  it("hides Admin navigation without capability and collapses it to one entry", () => {
    const { rerender } = render(
      <SidebarProvider>
        <AppSidebar profile={null} onSignOut={vi.fn()} favorites={[]} adminNavigation={[]} />
      </SidebarProvider>,
    );

    expect(screen.queryByRole("link", { name: "Admin workspace" })).not.toBeTruthy();

    rerender(
      <SidebarProvider>
        <AppSidebar
          profile={null}
          onSignOut={vi.fn()}
          favorites={[]}
          adminNavigation={[
            { key: "people", label: "People", capability: "users.view", href: "/admin/people" },
            { key: "audit", label: "Audit", capability: "audit.view", href: "/admin/audit" },
          ]}
        />
      </SidebarProvider>,
    );

    // Sub-destinations belong to the AdminShell sidebar, not the global one.
    expect(screen.queryByRole("link", { name: "People" })).not.toBeTruthy();
    expect(screen.queryByRole("link", { name: "Audit" })).not.toBeTruthy();

    // The single entry targets the first permitted destination, not a hardcoded /admin
    // that an actor without overview capability could not open.
    expect(screen.getByRole("link", { name: "Admin workspace" }).getAttribute("href")).toBe(
      "/admin/people",
    );
  });
});
