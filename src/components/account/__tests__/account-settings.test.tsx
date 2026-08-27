// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSettings, type AccountTab, type AccountViewData } from "../account-settings";

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

type Handlers = Partial<{
  onUpdateProfile: (input: unknown) => Promise<unknown>;
  onUpdateAvailability: (input: unknown) => Promise<unknown>;
  onRevokeSessions: () => Promise<unknown>;
  onCreateDelegation: (input: unknown) => Promise<unknown>;
  onCancelDelegation: (id: string) => Promise<unknown>;
  onCreateAccessRequest: (input: unknown) => Promise<unknown>;
}>;

/**
 * The tab now belongs to the route's search params, not to the component (IF-E2-50), so the
 * harness plays the part the route plays: it holds the value, hands it down, and records
 * every change. That is what makes "click Security, see Security" still a meaningful
 * assertion without the component owning any state of its own.
 */
function Harness({
  onTabChange,
  welcome,
  handlers = {},
}: {
  onTabChange?: (tab: AccountTab) => void;
  welcome?: boolean;
  handlers?: Handlers;
}) {
  const [tab, setTab] = useState<AccountTab>("profile");
  return (
    <AccountSettings
      account={account}
      tab={tab}
      welcome={welcome}
      onTabChange={(next) => {
        setTab(next);
        onTabChange?.(next);
      }}
      onUpdateProfile={handlers.onUpdateProfile ?? vi.fn()}
      onUpdateAvailability={handlers.onUpdateAvailability ?? vi.fn()}
      onRevokeSessions={handlers.onRevokeSessions ?? vi.fn()}
      onCreateDelegation={handlers.onCreateDelegation ?? vi.fn()}
      onCancelDelegation={handlers.onCancelDelegation ?? vi.fn()}
      onCreateAccessRequest={handlers.onCreateAccessRequest ?? vi.fn()}
    />
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => cleanup());

describe("account settings", () => {
  it("keeps role, department, manager, and teams read-only", () => {
    render(<Harness />);

    expect(screen.getByText("sales")).toBeTruthy();
    expect(screen.getByText("Growth")).toBeTruthy();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Revenue")).toBeTruthy();
    expect(screen.queryByLabelText("Role")).not.toBeTruthy();
  });

  it("saves allowed profile fields without exposing restricted fields", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn().mockResolvedValue(undefined);

    render(<Harness handlers={{ onUpdateProfile }} />);

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

    render(<Harness handlers={{ onRevokeSessions }} />);

    await user.click(screen.getByRole("tab", { name: "Security" }));
    expect(screen.getByRole("link", { name: "Reset password" }).getAttribute("href")).toBe(
      "/login/forgot-password",
    );

    await user.click(screen.getByRole("button", { name: "Revoke app sessions" }));
    expect(onRevokeSessions).toHaveBeenCalledTimes(1);
  });

  it("shows personal workload and availability through separate tabs", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("tab", { name: "Workload" }));
    expect(screen.getByText("Open tasks")).toBeTruthy();
    expect(screen.getAllByText("2").length).toBe(2);

    await user.click(screen.getByRole("tab", { name: "Availability" }));
    expect((screen.getByLabelText("Availability status") as HTMLSelectElement).value).toBe(
      "available",
    );
    expect(screen.getByLabelText("Leave starts")).toBeTruthy();
  });

  it("reports every tab change to its caller so the URL can own the tab", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<Harness onTabChange={onTabChange} />);

    await user.click(screen.getByRole("tab", { name: "Access" }));
    expect(onTabChange).toHaveBeenCalledWith("access");
  });

  it("greets a newly activated user, and stays quiet on every other visit", () => {
    const { unmount } = render(<Harness welcome />);
    expect(screen.getByText("Your account is active.")).toBeTruthy();
    unmount();

    render(<Harness />);
    expect(screen.queryByText("Your account is active.")).toBeNull();
  });

  it("locks every save while one write is in flight, so one click is one write", async () => {
    const user = userEvent.setup();
    const request = deferred<unknown>();
    const onUpdateProfile = vi.fn().mockReturnValue(request.promise);

    render(<Harness handlers={{ onUpdateProfile }} />);

    await user.click(screen.getByRole("button", { name: "Save profile" }));
    const saving = await screen.findByRole("button", { name: "Saving..." });
    expect(saving.hasAttribute("disabled")).toBe(true);

    await user.click(saving);
    expect(onUpdateProfile).toHaveBeenCalledTimes(1);

    request.resolve(undefined);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Saved"));
  });

  it("reports a failed save in the same sanitized words the toast uses", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi
      .fn()
      .mockRejectedValue(new Error("permission denied for table profiles (SQLSTATE 42501)"));

    render(<Harness handlers={{ onUpdateProfile }} />);

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Something went wrong. Please try again.");
    expect(alert.textContent).not.toContain("permission denied");
    expect(alert.textContent).not.toContain("profiles");
    // The button is usable again immediately: the lock releases in `finally`.
    expect(screen.getByRole("button", { name: "Save profile" }).hasAttribute("disabled")).toBe(
      false,
    );
  });

  it("offers only capabilities the server will accept, and never permissions.override", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("tab", { name: "Access" }));
    const select = screen.getByLabelText("Capability") as HTMLSelectElement;
    const values = [...select.options].map((option) => option.value);

    expect(values).toContain("accounts.update");
    // `accessRequestSchema` rejects it outright, so offering it is offering a guaranteed
    // failure.
    expect(values).not.toContain("permissions.override");
    expect(values.length).toBeGreaterThan(10);
  });

  it("refuses a team request whose id is not a team id, without paying a round trip", async () => {
    const user = userEvent.setup();
    const onCreateAccessRequest = vi.fn().mockResolvedValue(undefined);
    render(<Harness handlers={{ onCreateAccessRequest }} />);

    await user.click(screen.getByRole("tab", { name: "Access" }));
    await user.selectOptions(screen.getByLabelText("Request type"), "team");
    await user.type(screen.getByLabelText("Team ID"), "revenue");
    await user.type(screen.getByLabelText("Access request reason"), "Covering renewals in Q4");
    await user.click(screen.getByRole("button", { name: "Submit access request" }));

    expect(onCreateAccessRequest).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("8-4-4-4-12");
  });
});
