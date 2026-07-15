import { describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
import { createAdminUsersRepository } from "../admin-users";

function fakeDatabase(rowsByQuery: unknown[][] = []): Queryable & {
  calls: string[];
  values: unknown[][];
} {
  const calls: string[] = [];
  const values: unknown[][] = [];
  return {
    calls,
    values,
    async query<T>(text: string, queryValues: readonly unknown[] = []) {
      calls.push(text);
      values.push([...queryValues]);
      return { rows: (rowsByQuery.shift() ?? []) as T[] };
    },
  };
}

const profileRow = {
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
  last_active_at: "2026-07-16T00:00:00.000Z",
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
  department_name: "Sales",
  manager_name: "Manager",
  team_count: 2,
  open_task_count: 3,
};

describe("admin users repository", () => {
  it("clamps directory pagination and applies parameterized filters", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([profileRow]);
    const repo = createAdminUsersRepository({ query });

    const result = await repo.listAdminUsers({
      search: "Person",
      role: "sales",
      status: "active",
      departmentId: "dept-1",
      teamId: "team-1",
      page: 0,
      limit: 500,
    });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(100);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: "profile-1",
      name: "Person",
      teamCount: 2,
      openTaskCount: 3,
    });
    expect(query.mock.calls[0]?.[0]).toContain("exists");
    expect(query.mock.calls[0]?.[0]).toContain("team_memberships");
    expect(query.mock.calls[1]?.[0]).toContain("where (p.name ilike $1");
    expect(query.mock.calls[1]?.[0]).not.toContain("$" + "{where}");
    expect(query.mock.calls[1]?.[0]).toContain("order by");
    expect(query.mock.calls[1]?.[1]).toEqual([
      "%Person%",
      "sales",
      "active",
      "dept-1",
      "team-1",
      100,
      0,
    ]);
  });

  it("maps overview counts for actionable admin navigation", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        active_users: "8",
        invited_users: 2,
        suspended_users: 1,
        deactivated_users: 1,
        pending_invitations: 2,
        managerless_teams: 1,
        expiring_overrides: 3,
        pending_access_requests: 4,
      },
    ]);
    const repo = createAdminUsersRepository({ query });

    await expect(repo.getAdminOverview()).resolves.toEqual({
      activeUsers: 8,
      invitedUsers: 2,
      suspendedUsers: 1,
      deactivatedUsers: 1,
      pendingInvitations: 2,
      managerlessTeams: 1,
      expiringOverrides: 3,
      pendingAccessRequests: 4,
    });
  });

  it("protects the last active super admin during role changes", async () => {
    const db = fakeDatabase([
      [{ id: "super-1", role: "super_admin", status: "active" }],
      [{ count: 1 }],
    ]);
    const repo = createAdminUsersRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(db),
    });

    await expect(
      repo.changeUserRole("super-1", "admin", "Role transition", "admin-1"),
    ).rejects.toThrow("last active Super Admin");
    expect(db.calls[0]?.toLowerCase()).toContain("for update");
    expect(db.calls[1]).toContain("count");
  });

  it("updates lifecycle state, invalidates sessions, and audits in one transaction", async () => {
    const updated = { ...profileRow, status: "suspended", suspended_by: "admin-1" };
    const db = fakeDatabase([[profileRow], [updated], [{ id: "audit-1" }]]);
    const repo = createAdminUsersRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(db),
    });

    await expect(
      repo.setUserStatus("profile-1", "suspend", "Security leave", "admin-1"),
    ).resolves.toMatchObject({ id: "profile-1", status: "suspended" });

    expect(db.calls[0]?.toLowerCase()).toContain("for update");
    expect(db.calls[1]).toContain("session_invalid_before");
    expect(db.calls[2]).toContain("admin_audit_logs");
  });

  it("returns workload counts from assigned CRM work", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        open_tasks: "3",
        assigned_leads: 4,
        owned_accounts: 5,
        owned_clients: 2,
        owned_quotes: 6,
        owned_job_sheets: 1,
      },
    ]);
    const repo = createAdminUsersRepository({ query });

    await expect(repo.getUserWorkload("profile-1")).resolves.toEqual({
      openTasks: 3,
      assignedLeads: 4,
      ownedAccounts: 5,
      ownedClients: 2,
      ownedQuotes: 6,
      ownedJobSheets: 1,
    });
  });
});
