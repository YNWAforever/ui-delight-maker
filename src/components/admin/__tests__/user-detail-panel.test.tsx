// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params?: { id: string };
    children?: ReactNode;
  }) => (
    <a href={params ? to.replace("$id", params.id) : to} {...props}>
      {children}
    </a>
  ),
}));

import type { AdminUserDetail } from "@/server/repositories/admin-users";
import { UserDetailPanel } from "../user-detail-panel";

const user: AdminUserDetail = {
  id: "profile-1",
  email: "ada@example.com",
  name: "Ada Wong",
  role: "client_success",
  status: "suspended",
  avatarUrl: null,
  jobTitle: "Account Director",
  phone: null,
  locale: "en-HK",
  timezone: "Asia/Hong_Kong",
  primaryDepartmentId: "dept-1",
  managerProfileId: "manager-1",
  lastActiveAt: "2026-07-16T00:00:00.000Z",
  sessionInvalidBefore: null,
  availabilityStatus: "available",
  createdAt: "2026-01-01T00:00:00.000Z",
  departmentName: "Client Success",
  managerName: "Manager",
  teamCount: 2,
  openTaskCount: 3,
};

afterEach(() => cleanup());

describe("UserDetailPanel", () => {
  it("renders no write control when the caller passes no handler", () => {
    // "Change role" was the one control wired unconditionally while Invite and Manage
    // lifecycle beside it were gated, so a read_only actor — who legitimately reaches this
    // screen through `users.view` — could open the dialog, type a mandatory reason, submit,
    // and only then be refused.
    render(<UserDetailPanel user={user} />);

    for (const label of ["Change role", "Reactivate", "Revoke sessions", "Suspend or deactivate"]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("keeps every dangerous action subordinate to the safe one", () => {
    render(
      <UserDetailPanel
        user={user}
        showFullRecordLink
        onRoleChange={vi.fn()}
        onLifecycle={vi.fn()}
        onRevokeSessions={vi.fn()}
      />,
    );

    // The one filled control on this panel is the safe navigation. A mis-click here has an
    // irreversible human cost, so nothing that removes access is the visual primary and
    // nothing wears the destructive fill — that appears only in the confirmation dialog.
    const link = screen.getByRole("link", { name: /Open full record/ });
    expect(link.getAttribute("href")).toBe("/admin/people/profile-1");

    for (const label of ["Change role", "Revoke sessions", "Suspend or deactivate"]) {
      const button = screen.getByRole("button", { name: label });
      expect(button.className).toContain("border");
      expect(button.className).not.toContain("bg-destructive");
      expect(button.className).not.toContain("bg-primary");
    }
  });

  it("disables every action together while a write is in flight", () => {
    const onRoleChange = vi.fn();
    render(<UserDetailPanel user={user} busy onRoleChange={onRoleChange} onLifecycle={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Change role" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(onRoleChange).not.toHaveBeenCalled();
  });

  it("names the account state as a word, never as a colour alone", () => {
    render(<UserDetailPanel user={user} />);
    expect(screen.getByText("Suspended")).toBeTruthy();
    // The role reads as a name a person would say, not `role.replace("_", " ")` leaning on
    // a CSS `capitalize` class to make it look like one.
    expect(screen.getAllByText("Client Success").length).toBeGreaterThan(0);
  });
});
