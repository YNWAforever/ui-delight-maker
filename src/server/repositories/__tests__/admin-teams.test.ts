import { describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
import { createAdminTeamsRepository } from "../admin-teams";

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

describe("admin teams repository", () => {
  it("lists organization units with active memberships and deterministic ordering", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "dept-1",
          name: "Sales",
          description: null,
          headProfileId: null,
          deputyProfileId: null,
          status: "active",
          createdBy: null,
          updatedBy: null,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "dept-2",
          name: "Archived",
          description: null,
          headProfileId: null,
          deputyProfileId: null,
          status: "archived",
          createdBy: null,
          updatedBy: null,
          createdAt: "",
          updatedAt: "",
        },
      ])
      .mockResolvedValueOnce([{ id: "team-1", name: "Growth", status: "active" }])
      .mockResolvedValueOnce([
        {
          id: "membership-1",
          team_id: "team-1",
          profile_id: "profile-1",
          membership_role: "member",
          starts_at: null,
          ends_at: null,
        },
      ]);
    const repo = createAdminTeamsRepository({ query });

    await expect(repo.listDepartmentsAndTeams()).resolves.toEqual({
      departments: [
        {
          id: "dept-1",
          name: "Sales",
          description: null,
          headProfileId: null,
          deputyProfileId: null,
          status: "active",
          createdBy: null,
          updatedBy: null,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "dept-2",
          name: "Archived",
          description: null,
          headProfileId: null,
          deputyProfileId: null,
          status: "archived",
          createdBy: null,
          updatedBy: null,
          createdAt: "",
          updatedAt: "",
        },
      ],
      teams: [
        {
          id: "team-1",
          name: "Growth",
          purpose: null,
          leadProfileId: null,
          deputyProfileId: null,
          defaultOwnerProfileId: null,
          status: "active",
          createdBy: null,
          updatedBy: null,
          createdAt: "",
          updatedAt: "",
        },
      ],
      memberships: [
        {
          id: "membership-1",
          teamId: "team-1",
          profileId: "profile-1",
          membershipRole: "member",
          startsAt: null,
          endsAt: null,
          createdBy: null,
          createdAt: "",
          updatedAt: "",
        },
      ],
    });

    expect(query.mock.calls[0]?.[0]).toContain("lower(name)");
    expect(query.mock.calls[2]?.[0]).toContain("starts_at <= now()");
    expect(query.mock.calls[2]?.[0]).toContain("ends_at > now()");
  });

  it("creates a team and writes its audit record in one transaction", async () => {
    const team = {
      id: "team-1",
      api_token: "plain-token",
      name: "Growth",
      purpose: "Pipeline ownership",
      lead_profile_id: "profile-1",
      deputy_profile_id: null,
      default_owner_profile_id: "profile-1",
      status: "active",
      created_by: "admin-1",
      updated_by: "admin-1",
      created_at: "2026-07-16T00:00:00.000Z",
      updated_at: "2026-07-16T00:00:00.000Z",
    };
    const db = fakeDatabase([[team], [{ id: "audit-1" }]]);
    const repo = createAdminTeamsRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(db),
    });

    await expect(
      repo.createTeam(
        {
          name: "  Growth  ",
          purpose: "Pipeline ownership",
          leadProfileId: "profile-1",
          defaultOwnerProfileId: "profile-1",
        },
        "admin-1",
      ),
    ).resolves.toMatchObject({
      id: "team-1",
      name: "Growth",
      leadProfileId: "profile-1",
    });

    expect(db.calls.some((sql) => sql.includes("insert into teams"))).toBe(true);
    expect(db.calls.some((sql) => sql.includes("admin_audit_logs"))).toBe(true);
    expect(db.values[1]?.some((value) => String(value).includes("plain-token"))).toBe(false);
    expect(db.values[1]?.some((value) => String(value).includes("[REDACTED]"))).toBe(true);
  });

  it("rejects overlapping temporary memberships after locking the window", async () => {
    const db = fakeDatabase([
      [{ id: "team-1" }],
      [
        {
          id: "membership-existing",
          team_id: "team-1",
          profile_id: "profile-1",
          starts_at: "2026-07-20T00:00:00.000Z",
          ends_at: "2026-07-22T00:00:00.000Z",
        },
      ],
    ]);
    const repo = createAdminTeamsRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(db),
    });

    await expect(
      repo.upsertTeamMembership(
        {
          teamId: "team-1",
          profileId: "profile-1",
          membershipRole: "member",
          startsAt: "2026-07-21T00:00:00.000Z",
          endsAt: "2026-07-25T00:00:00.000Z",
        },
        "admin-1",
      ),
    ).rejects.toThrow("Team membership overlaps an existing membership");

    expect(db.calls[0]?.toLowerCase()).toContain("for update");
    expect(db.calls[1]).toContain("starts_at <");
    expect(db.calls[1]).toContain("ends_at >");
  });

  it("ends a membership only after locking the current row", async () => {
    const db = fakeDatabase([
      [
        {
          id: "membership-1",
          team_id: "team-1",
          profile_id: "profile-1",
          membership_role: "member",
          starts_at: null,
          ends_at: "2026-07-30T00:00:00.000Z",
        },
      ],
      [
        {
          id: "membership-1",
          team_id: "team-1",
          profile_id: "profile-1",
          membership_role: "member",
          starts_at: null,
          ends_at: "2026-07-25T00:00:00.000Z",
        },
      ],
      [{ id: "audit-1" }],
    ]);
    const repo = createAdminTeamsRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(db),
    });

    await expect(
      repo.endTeamMembership("team-1", "profile-1", "2026-07-25T00:00:00.000Z", "admin-1"),
    ).resolves.toBeUndefined();

    expect(db.calls[0]?.toLowerCase()).toContain("for update");
    expect(db.calls[1]).toContain("update team_memberships");
    expect(db.calls[2]).toContain("admin_audit_logs");
  });

  it("blocks department archive while head or deputy responsibilities remain", async () => {
    const db = fakeDatabase([
      [
        {
          id: "dept-1",
          name: "Sales",
          status: "active",
          head_profile_id: "profile-1",
          deputy_profile_id: null,
        },
      ],
    ]);
    const repo = createAdminTeamsRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(db),
    });

    await expect(
      repo.updateDepartment("dept-1", { name: "Sales", status: "archived" }, "admin-1"),
    ).rejects.toThrow("Clear or reassign the department head and deputy before archiving");
    expect(db.calls).toHaveLength(1);
  });

  it("archives a team only after clearing responsibilities and preserves membership history", async () => {
    const before = {
      id: "team-1",
      name: "Growth",
      purpose: null,
      lead_profile_id: null,
      deputy_profile_id: null,
      default_owner_profile_id: null,
      status: "active",
    };
    const after = { ...before, status: "archived" };
    const db = fakeDatabase([[before], [after], [], [{ id: "audit-1" }]]);
    const repo = createAdminTeamsRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(db),
    });

    await expect(
      repo.updateTeam(
        "team-1",
        {
          name: "Growth",
          status: "archived",
          leadProfileId: null,
          deputyProfileId: null,
          defaultOwnerProfileId: null,
        },
        "admin-1",
      ),
    ).resolves.toMatchObject({ id: "team-1", status: "archived" });

    expect(db.calls.some((sql) => sql.includes("update team_memberships"))).toBe(true);
    expect(db.calls.some((sql) => sql.toLowerCase().includes("delete from team_memberships"))).toBe(
      false,
    );
    expect(db.calls.some((sql) => sql.includes("interval '1 second'"))).toBe(true);
    expect(db.values.some((values) => values.includes("team.archived"))).toBe(true);
  });

  it("loads open owned work for a team from active members and team responsibilities", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "team-1",
          name: "Growth",
          purpose: null,
          lead_profile_id: "profile-1",
          deputy_profile_id: null,
          default_owner_profile_id: "profile-1",
          status: "active",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "membership-1",
          team_id: "team-1",
          profile_id: "profile-2",
          membership_role: "member",
          starts_at: null,
          ends_at: null,
        },
      ])
      .mockResolvedValueOnce([{ count: "3" }]);
    const repo = createAdminTeamsRepository({ query });

    await expect(repo.getOrganizationUnit("team", "team-1")).resolves.toMatchObject({
      openOwnedWorkCount: 3,
    });
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining("job_sheets"), [
      ["profile-1", "profile-2"],
    ]);
  });
});
