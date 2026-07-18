// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSettings, type AccountViewData } from "../account-settings";

const account: AccountViewData = {
  profile: {
    id: "profile-1",
    email: "person@example.com",
    name: "Person",
    role: "sales",
    status: "active",
    avatar_url: null,
    job_title: "Account Executive",
    phone: "+852 1234 5678",
    locale: "en-HK",
    timezone: "Asia/Hong_Kong",
    primary_department_id: "dept-1",
    manager_profile_id: "manager-1",
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
    created_at: "2026-01-01T00:00:00.000Z",
  },
  departmentName: "Growth",
  managerName: "Ada Lovelace",
  teams: [{ teamId: "team-1", teamName: "Revenue", membershipRole: "member" }],
  workload: {
    openTasks: 2,
    assignedLeads: 3,
    ownedAccounts: 1,
    ownedClients: 1,
    ownedQuotes: 2,
    ownedJobSheets: 1,
  },
  delegations: [],
  accessRequests: [],
};

afterEach(() => cleanup());

describe("account settings", () => {
  it("keeps role, department, manager, and teams read-only", () => {
    render(
      <AccountSettings
        account={account}
        onUpdateProfile={vi.fn()}
        onUpdateAvailability={vi.fn()}
        onRevokeSessions={vi.fn()}
        onCreateDelegation={vi.fn()}
        onCancelDelegation={vi.fn()}
        onCreateAccessRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("sales")).toBeTruthy();
    expect(screen.getByText("Growth")).toBeTruthy();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Revenue")).toBeTruthy();
    expect(screen.queryByLabelText("Role")).not.toBeTruthy();
  });

  it("saves allowed profile fields without exposing restricted fields", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn().mockResolvedValue(undefined);

    render(
      <AccountSettings
        account={account}
        onUpdateProfile={onUpdateProfile}
        onUpdateAvailability={vi.fn()}
        onRevokeSessions={vi.fn()}
        onCreateDelegation={vi.fn()}
        onCancelDelegation={vi.fn()}
        onCreateAccessRequest={vi.fn()}
      />,
    );

    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Updated Person");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(onUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Updated Person" }),
    );
  });

  it("links password reset to the supported forgot-password route and revokes app sessions", async () => {
    const user = userEvent.setup();
    const onRevokeSessions = vi.fn().mockResolvedValue(undefined);

    render(
      <AccountSettings
        account={account}
        onUpdateProfile={vi.fn()}
        onUpdateAvailability={vi.fn()}
        onRevokeSessions={onRevokeSessions}
        onCreateDelegation={vi.fn()}
        onCancelDelegation={vi.fn()}
        onCreateAccessRequest={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Security" }));
    expect(screen.getByRole("link", { name: "Reset password" }).getAttribute("href")).toBe(
      "/login/forgot-password",
    );

    await user.click(screen.getByRole("button", { name: "Revoke app sessions" }));
    expect(onRevokeSessions).toHaveBeenCalledTimes(1);
  });

  it("shows personal workload and availability through separate tabs", async () => {
    const user = userEvent.setup();
    render(
      <AccountSettings
        account={account}
        onUpdateProfile={vi.fn()}
        onUpdateAvailability={vi.fn()}
        onRevokeSessions={vi.fn()}
        onCreateDelegation={vi.fn()}
        onCancelDelegation={vi.fn()}
        onCreateAccessRequest={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Workload" }));
    expect(screen.getByText("Open tasks")).toBeTruthy();
    expect(screen.getAllByText("2").length).toBe(2);

    await user.click(screen.getByRole("tab", { name: "Availability" }));
    expect((screen.getByLabelText("Availability status") as HTMLSelectElement).value).toBe(
      "available",
    );
    expect(screen.getByLabelText("Leave starts")).toBeTruthy();
  });
});
