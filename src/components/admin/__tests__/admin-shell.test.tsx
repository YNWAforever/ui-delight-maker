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

    expect(screen.getByRole("heading", { name: "Admin workspace" })).toBeTruthy();
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
});
