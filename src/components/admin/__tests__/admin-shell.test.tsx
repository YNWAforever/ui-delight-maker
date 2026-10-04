// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

let currentPath = "/admin";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: currentPath } }),
}));

import { AdminShell } from "../admin-shell";

afterEach(() => cleanup());

beforeEach(() => {
  currentPath = "/admin";
});

describe("AdminShell", () => {
  const navigation = [
    { key: "overview", label: "Overview", capability: "users.view", href: "/admin" },
    { key: "people", label: "People", capability: "users.view", href: "/admin/people" },
    { key: "teams", label: "Teams", capability: "teams.view", href: "/admin/teams" },
  ] as const;

  it("renders compact admin navigation and marks the active route", () => {
    currentPath = "/admin/people/profile-1";
    render(
      <AdminShell navigation={navigation}>
        <div>People workspace</div>
      </AdminShell>,
    );

    // The rail names itself in text but must expose no heading: it renders before the
    // page's WorkspaceHeader, so a heading here would either duplicate the page's h1 or
    // place a subheading above it. See the note in admin-shell.tsx.
    expect(screen.getByText("Admin workspace")).toBeTruthy();
    expect(screen.queryAllByRole("heading")).toEqual([]);
    expect(screen.getByRole("link", { name: "People" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Teams" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByText("People workspace")).toBeTruthy();
  });

  it("renders only the capabilities returned for a scoped manager", () => {
    render(
      <AdminShell navigation={[navigation[0], navigation[1]]}>
        <div />
      </AdminShell>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "People" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Teams" })).not.toBeTruthy();
  });

  it("is a row of tabs above the page until 2xl, and a rail only from 2xl", () => {
    // UX-12: a second 224 px rail beside the app sidebar left admin pages ~800 px at 1280.
    const { container } = render(
      <AdminShell navigation={navigation}>
        <div />
      </AdminShell>,
    );
    const shell = container.firstElementChild as HTMLElement;

    expect(shell.className).toContain("flex-col");
    expect(shell.className).toContain("2xl:flex-row");
    expect(shell.className).not.toMatch(/(^|\s)(md|lg|xl):flex-row/);
    // The descriptive copy is rail-only; the tab row keeps just the name.
    expect(screen.getByText("People, teams, access, and audit.").className).toContain("hidden");
  });
});
