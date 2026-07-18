import { describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
import { createAdminAccessRepository, redactAuditValue } from "../admin-access";

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

describe("admin access repository", () => {
  it("lists only active actor-bound overrides", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        profile_id: "profile-1",
        capability: "accounts.update",
        effect: "allow",
        department_id: null,
        team_id: null,
        resource_type: null,
        resource_id: null,
        expires_at: null,
        revoked_at: null,
      },
    ]);
    const repo = createAdminAccessRepository({ query });

    await expect(repo.listActiveOverrides("profile-1")).resolves.toEqual([
      {
        profileId: "profile-1",
        capability: "accounts.update",
        effect: "allow",
        departmentId: null,
        teamId: null,
        resourceType: null,
        resourceId: null,
        expiresAt: null,
        revokedAt: null,
      },
    ]);

    expect(query).toHaveBeenCalledWith(expect.stringContaining("expires_at > now()"), [
      "profile-1",
    ]);
  });

  it("creates overrides and audit records in one transaction", async () => {
    const created = {
      id: "override-1",
      profile_id: "profile-1",
      capability: "accounts.update",
      effect: "allow",
      reason: "Temporary coverage",
    };
    const db = fakeDatabase([[created], [{ id: "audit-1" }]]);
    let transactionCalls = 0;
    const repo = createAdminAccessRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => {
        transactionCalls += 1;
        return work(db);
      },
    });

    await expect(
      repo.createPermissionOverride(
        {
          profileId: "profile-1",
          capability: "accounts.update",
          effect: "allow",
          reason: "Temporary coverage",
        },
        "admin-1",
      ),
    ).resolves.toEqual({
      profileId: "profile-1",
      capability: "accounts.update",
      effect: "allow",
      departmentId: null,
      teamId: null,
      resourceType: null,
      resourceId: null,
      expiresAt: null,
      revokedAt: null,
    });

    expect(transactionCalls).toBe(1);
    expect(db.calls.some((sql) => sql.includes("permission_overrides"))).toBe(true);
    expect(db.calls.some((sql) => sql.includes("admin_audit_logs"))).toBe(true);
    expect(db.values.flat()).toContain("admin-1");
  });

  it("locks pending access requests and rejects replayed decisions", async () => {
    const db = fakeDatabase([
      [{ id: "request-1", status: "approved", requester_profile_id: "profile-1" }],
    ]);
    const repo = createAdminAccessRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(db),
    });

    await expect(
      repo.decideAccessRequest(
        { id: "request-1", decision: "approved", reason: "Approved for coverage" },
        "admin-1",
      ),
    ).rejects.toThrow("Access request has already been decided");
    expect(db.calls[0].toLowerCase()).toContain("for update");
  });

  it("rejects overlapping active delegations after locking the window", async () => {
    const db = fakeDatabase([[{ id: "profile-1" }], [{ id: "delegation-existing" }]]);
    const repo = createAdminAccessRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(db),
    });

    await expect(
      repo.createWorkDelegation(
        {
          delegatorProfileId: "profile-1",
          delegateProfileId: "profile-2",
          startsAt: "2026-07-20T00:00:00.000Z",
          endsAt: "2026-07-25T00:00:00.000Z",
          reason: "Annual leave coverage",
        },
        "admin-1",
      ),
    ).rejects.toThrow("Delegation overlaps an active delegation");

    expect(db.calls[0].toLowerCase()).toContain("for update");
    expect(db.calls[1]).toContain("starts_at <");
    expect(db.calls[1]).toContain("ends_at >");
  });

  it("approves team access by creating a membership in the decision transaction", async () => {
    const before = {
      id: "request-1",
      requester_profile_id: "profile-1",
      request_type: "team",
      capability: null,
      team_id: "team-1",
      reason: "Need team access",
      status: "pending",
      decided_by: null,
      decision_reason: null,
      decided_at: null,
      access_expires_at: null,
      created_at: "2026-07-16T00:00:00.000Z",
      updated_at: "2026-07-16T00:00:00.000Z",
    };
    const after = {
      ...before,
      status: "approved",
      decided_by: "admin-1",
      decision_reason: "Approved team access",
      decided_at: "2026-07-16T00:00:00.000Z",
      access_expires_at: "2026-07-31T00:00:00.000Z",
    };
    const db = fakeDatabase([[before], [after], [{ id: "team-1" }], [], [], [{ id: "audit-1" }]]);
    const repo = createAdminAccessRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(db),
    });

    await expect(
      repo.decideAccessRequest(
        {
          id: "request-1",
          decision: "approved",
          reason: "Approved team access",
          accessExpiresAt: "2026-07-31T00:00:00.000Z",
        },
        "admin-1",
      ),
    ).resolves.toMatchObject({ id: "request-1", status: "approved", teamId: "team-1" });

    expect(db.calls[4]).toContain("insert into team_memberships");
    expect(db.values[4]).toEqual(["team-1", "profile-1", "2026-07-31T00:00:00.000Z", "admin-1"]);
  });

  it("rejects access requests with unknown capabilities", async () => {
    const repo = createAdminAccessRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(fakeDatabase()),
    });

    await expect(
      repo.createAccessRequest(
        {
          requestType: "capability",
          capability: "not-a-capability" as never,
          reason: "Need a valid capability",
        },
        "profile-1",
      ),
    ).rejects.toThrow("Unknown capability");
  });
  it("clamps audit pagination and recursively redacts sensitive snapshots", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        {
          id: "audit-1",
          actor_profile_id: "admin-1",
          target_type: "user",
          target_id: "profile-1",
          action: "profile.updated",
          severity: "info",
          before_snapshot: {
            email: "person@example.com",
            credentials: {
              password: "plain",
              apiKey: "key-value",
            },
          },
          after_snapshot: {
            invitation: { rawToken: "raw-token" },
            session_id: "session-secret",
          },
          created_at: "2026-07-16T00:00:00.000Z",
        },
      ]);
    const repo = createAdminAccessRepository({ query });

    const result = await repo.listAdminAuditLogs({ page: 0, limit: 500 });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(100);
    expect(result.items[0]?.before_snapshot).toEqual({
      email: "person@example.com",
      credentials: { password: "[REDACTED]", apiKey: "[REDACTED]" },
    });
    expect(result.items[0]?.after_snapshot).toEqual({
      invitation: { rawToken: "[REDACTED]" },
      session_id: "[REDACTED]",
    });
    expect(query.mock.calls[1]?.[1]).toEqual([100, 0]);
    expect(redactAuditValue([{ cookie: "x" }])).toEqual([{ cookie: "[REDACTED]" }]);
  });
});
