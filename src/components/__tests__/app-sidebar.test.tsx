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
  it("renders personal favorites and labels the Account route Companies", () => {
    render(
      <SidebarProvider>
        <AppSidebar
          profile={{
            id: "profile-1",
            name: "Ada",
            role: "sales",
            avatar_url: null,
            created_at: "2026-01-01T00:00:00Z",
          }}
          onSignOut={vi.fn()}
          favorites={[{ id: "f1", label: "At-risk accounts", href: "/accounts?view=at-risk" }]}
        />
      </SidebarProvider>,
    );

    expect(screen.getByRole("link", { name: "Companies" }).getAttribute("href")).toBe("/accounts");
    expect(screen.getByRole("link", { name: "At-risk accounts" }).getAttribute("href")).toBe(
      "/accounts?view=at-risk",
    );
  });
});
