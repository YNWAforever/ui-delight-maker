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
      />,
    );

    // The page title is the route's WorkspaceHeader now, so this component owns no heading
    // and no Invite control: the invite action is capability-gated in the header instead.
    expect(screen.queryByRole("heading", { name: "People" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Invite users" })).toBeNull();

    // Selection is a real button in the identity cell rather than a click handler on the
    // row, so it is reachable by keyboard without announcing the whole row as one control.
    // ResponsiveRecordList keeps the table and the card list both in the DOM and hides one
    // with a media query, so the same row is present twice; either copy selects.
    fireEvent.click(screen.getAllByRole("button", { name: /Ada Wong/ })[0]);
    expect(onSelectUser).toHaveBeenCalledWith("profile-1");
  });

  it("offers no activity filter, because nothing forwards one to the query", () => {
    render(
      <PeopleDirectory
        data={data}
        search={search}
        onSearchChange={vi.fn()}
        onSelectUser={vi.fn()}
      />,
    );

    // `toUserFilters` never forwarded `activity` and `AdminUserFilters` has no such field,
    // so the select produced an identical query key and React Query served the same rows.
    expect(screen.queryByLabelText("Filter by activity")).toBeNull();
  });

  it("only offers department and team filters when it has real options", () => {
    const onSearchChange = vi.fn();
    const { rerender } = render(
      <PeopleDirectory
        data={data}
        search={search}
        onSearchChange={onSearchChange}
        onSelectUser={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Filter by department")).toBeNull();

    rerender(
      <PeopleDirectory
        data={data}
        search={search}
        onSearchChange={onSearchChange}
        onSelectUser={vi.fn()}
        departments={[{ id: "dept-1", name: "Sales" }]}
        teams={[{ id: "team-1", name: "Growth" }]}
      />,
    );

    // Both of these *are* forwarded to `listAdminUsers`; the props to feed them were declared
    // on this component and never destructured, so a working filter had no way to be used.
    fireEvent.change(screen.getByLabelText("Filter by department"), {
      target: { value: "dept-1" },
    });
    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ department: "dept-1", page: 1 }),
    );

    fireEvent.change(screen.getByLabelText("Filter by team"), { target: { value: "team-1" } });
    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ team: "team-1", page: 1 }),
    );
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
    expect(screen.getByText("No people yet")).toBeTruthy();
  });
});
