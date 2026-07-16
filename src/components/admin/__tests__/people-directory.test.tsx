// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { PeopleDirectory } from "../people-directory";

const user = {
  id: "profile-1",
  email: "ada@example.com",
  name: "Ada Wong",
  role: "sales",
  status: "active",
  avatarUrl: null,
  jobTitle: "Account Executive",
  phone: null,
  locale: "en-HK",
  timezone: "Asia/Hong_Kong",
  primaryDepartmentId: "dept-1",
  managerProfileId: "manager-1",
  lastActiveAt: "2026-07-16T00:00:00.000Z",
  sessionInvalidBefore: null,
  availabilityStatus: "available",
  createdAt: "2026-01-01T00:00:00.000Z",
  departmentName: "Sales",
  managerName: "Manager",
  teamCount: 2,
  openTaskCount: 3,
} as const;

const search = {
  q: undefined,
  status: undefined,
  role: undefined,
  department: undefined,
  team: undefined,
  manager: undefined,
  activity: undefined,
  user: undefined,
  page: 1,
};

const data = { items: [user], total: 1, page: 1, limit: 50 };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PeopleDirectory", () => {
  it("renders the directory and selects a row with click or keyboard", () => {
    const onSelectUser = vi.fn();
    render(
      <PeopleDirectory
        data={data}
        search={search}
        selectedUserId="profile-1"
        onSearchChange={vi.fn()}
        onSelectUser={onSelectUser}
        canInvite
        onInvite={vi.fn()}
      />,
    );

    const row = screen.getByRole("row", { name: /Ada Wong/ });
    expect(screen.getByRole("heading", { name: "People" })).toBeTruthy();
    expect(row.getAttribute("aria-selected")).toBe("true");

    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onSelectUser).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Invite users" })).toBeTruthy();
  });

  it("debounces search input and preserves URL filter fields", () => {
    vi.useFakeTimers();
    const onSearchChange = vi.fn();
    render(
      <PeopleDirectory
        data={data}
        search={{ ...search, role: "sales" }}
        onSearchChange={onSearchChange}
        onSelectUser={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search people" }), {
      target: { value: "  Ada  " },
    });
    act(() => vi.advanceTimersByTime(300));

    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "Ada", role: "sales", page: 1 }),
    );
  });

  it("keeps loading and empty states explicit", () => {
    const { rerender } = render(
      <PeopleDirectory
        data={undefined}
        search={search}
        loading
        onSearchChange={vi.fn()}
        onSelectUser={vi.fn()}
      />,
    );
    expect(screen.getByText("Loading people…")).toBeTruthy();

    rerender(
      <PeopleDirectory
        data={{ items: [], total: 0, page: 1, limit: 50 }}
        search={search}
        onSearchChange={vi.fn()}
        onSelectUser={vi.fn()}
      />,
    );
    expect(screen.getByText("No people match these filters.")).toBeTruthy();
  });
});
