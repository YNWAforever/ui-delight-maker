import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminError } from "@/lib/admin/errors";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const mocks = vi.hoisted(() => ({
  requireNeonAuthSession: vi.fn(),
  query: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: mocks.requireNeonAuthSession,
}));

vi.mock("@/legacy-supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mocks.query,
}));

import {
  requireAnyCapability,
  requireCapability,
  requireCapabilityChecks,
  requireCapabilitySet,
} from "../authorization.server";

function session(role: AppSession["profile"]["role"] = "manager"): AppSession {
  return {
    user: { id: "actor-1", email: "actor@example.com" },
    session: { id: "session-1", createdAt: "2026-07-16T00:00:00.000Z" },
    profile: {
      id: "actor-1",
      email: "actor@example.com",
      name: "Actor",
      role,
      status: "active",
      avatar_url: null,
      job_title: null,
      phone: null,
      locale: "en",
      timezone: "Asia/Hong_Kong",
      primary_department_id: "department-home",
      manager_profile_id: null,
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
      created_at: "2026-07-16T00:00:00.000Z",
    },
  };
}

function installDatabaseRows(
  options: {
    departments?: string[];
    teams?: string[];
    reports?: string[];
    overrides?: unknown[];
    resourceOwners?: Record<string, string | null>;
  } = {},
) {
  mocks.query.mockImplementation(async (sql: string, values: readonly unknown[]) => {
    if (sql.includes("from accounts")) {
      return [{ owner_profile_id: options.resourceOwners?.[String(values[0])] ?? "actor-1" }];
    }
    expect(values).toEqual(["actor-1"]);
    if (sql.includes("from departments")) {
      return (options.departments ?? []).map((id) => ({ id }));
    }
    if (sql.includes("from teams")) {
      return (options.teams ?? []).map((id) => ({ id }));
    }
    if (sql.includes("manager_profile_id")) {
      return (options.reports ?? []).map((id) => ({ id }));
    }
    if (sql.includes("from permission_overrides")) {
      return options.overrides ?? [];
    }
    throw new Error("Unexpected authorization query: " + sql);
  });
}

describe("admin authorization orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.createSupabaseServerClient.mockReset();
    mocks.requireNeonAuthSession.mockResolvedValue(session());
    installDatabaseRows();
  });

  it("returns the app session when a manager target is inside DB-derived scope", async () => {
    const appSession = session();
    mocks.requireNeonAuthSession.mockResolvedValue(appSession);
    installDatabaseRows({
      departments: ["department-managed"],
      teams: ["team-managed"],
      reports: ["report-1"],
    });

    await expect(
      requireCapability("users.manage", {
        profileId: "report-1",
        role: "sales",
        departmentId: "department-managed",
        teamId: "team-managed",
      }),
    ).resolves.toBe(appSession);

    const sql = mocks.query.mock.calls.map(([text]) => String(text)).join("\n");
    expect(sql).toContain("head_profile_id");
    expect(sql).toContain("deputy_profile_id");
    expect(sql).toContain("lead_profile_id");
    expect(sql).toContain("manager_profile_id");
  });

  it("loads only active actor-bound overrides and applies a matching allow", async () => {
    mocks.requireNeonAuthSession.mockResolvedValue(session("read_only"));
    installDatabaseRows({
      overrides: [
        {
          profile_id: "actor-1",
          capability: "accounts.update",
          effect: "allow",
          department_id: null,
          team_id: null,
          resource_type: "account",
          resource_id: "account-1",
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          revoked_at: null,
        },
      ],
    });

    await expect(
      requireCapability("accounts.update", {
        resourceType: "account",
        resourceId: "account-1",
      }),
    ).resolves.toMatchObject({ profile: { id: "actor-1" } });

    const overrideCall = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes("from permission_overrides"),
    );
    expect(overrideCall?.[0]).toContain("profile_id = $1");
    expect(overrideCall?.[0]).toContain("revoked_at is null");
    expect(overrideCall?.[0]).toContain("expires_at > now()");
    expect(overrideCall?.[1]).toEqual(["actor-1"]);
  });

  it("resolves account ownership before evaluating manager scope", async () => {
    installDatabaseRows({
      reports: ["report-1"],
      resourceOwners: { "account-1": "report-1" },
    });

    await expect(
      requireCapability("accounts.update", {
        resourceType: "account",
        resourceId: "account-1",
      }),
    ).resolves.toMatchObject({ profile: { id: "actor-1" } });

    const accountScopeCall = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes("from accounts"),
    );
    expect(accountScopeCall?.[1]).toEqual(["account-1"]);
  });

  it("rejects a manager target when the server-derived owner is outside scope", async () => {
    installDatabaseRows({
      reports: ["report-1"],
      resourceOwners: { "account-2": "other-1" },
    });

    await expect(
      requireCapability("accounts.update", {
        resourceType: "account",
        resourceId: "account-2",
      }),
    ).rejects.toEqual(new AdminError("OUTSIDE_SCOPE", "Target is outside your management scope"));
  });
  it("resolves Supabase-owned records through the Supabase owner scope", async () => {
    installDatabaseRows({ reports: ["report-1"] });

    const dealRow = {
      account_id: "account-1",
      owner: null,
    };
    const accountRow = {
      account_owner: "report-1",
    };
    const maybeSingle = vi.fn();
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn((fields: string) => {
      maybeSingle.mockResolvedValue({
        data: fields === "account_id, owner" ? dealRow : accountRow,
        error: null,
      });
      return { eq };
    });
    mocks.createSupabaseServerClient.mockReturnValue({
      from: vi.fn(() => ({ select })),
    });

    await expect(
      requireCapability("accounts.update", {
        resourceType: "deal",
        resourceId: "deal-1",
      }),
    ).resolves.toMatchObject({ profile: { id: "actor-1" } });

    expect(select).toHaveBeenCalledWith("account_id, owner");
    expect(select).toHaveBeenCalledWith("account_owner");
  });
  /**
   * The quarantined Supabase modules hold account ids from the other database, and the two
   * carry different id spaces for the same entity. Resolving one against the other found no row
   * and reported the account as unowned — which read as "in scope" while an absent owner meant
   * no constraint, and as "outside scope" once that stopped being true. Neither was an answer
   * about the account.
   */
  describe("account ownership resolves from the database that holds the account", () => {
    function supabaseAccountOwnedBy(owner: string | null) {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: owner === null ? null : { account_owner: owner },
        error: null,
      });
      const eq = vi.fn(() => ({ maybeSingle }));
      const select = vi.fn(() => ({ eq }));
      const from = vi.fn(() => ({ select }));
      mocks.createSupabaseServerClient.mockReturnValue({ from });
      return { from, select };
    }

    it("reads a supabase_account from Supabase, never from Neon", async () => {
      installDatabaseRows({ reports: ["report-1"] });
      const { from } = supabaseAccountOwnedBy("report-1");

      await expect(
        requireCapability("engagements.update", {
          resourceType: "supabase_account",
          resourceId: "supabase-account-1",
        }),
      ).resolves.toMatchObject({ profile: { id: "actor-1" } });

      expect(from).toHaveBeenCalledWith("accounts");
      // The Neon accounts table is never consulted for this id.
      const neonAccountReads = mocks.query.mock.calls.filter(([sql]) =>
        String(sql).includes("from accounts"),
      );
      expect(neonAccountReads).toHaveLength(0);
    });

    it("denies a supabase_account owned outside the manager's reports", async () => {
      installDatabaseRows({ reports: ["report-1"] });
      supabaseAccountOwnedBy("someone-else");

      await expect(
        requireCapability("engagements.update", {
          resourceType: "supabase_account",
          resourceId: "supabase-account-1",
        }),
      ).rejects.toMatchObject({ code: "OUTSIDE_SCOPE" });
    });

    it("keeps reading a plain account from Neon", async () => {
      installDatabaseRows({
        reports: ["report-1"],
        resourceOwners: { "neon-account-1": "report-1" },
      });

      await expect(
        requireCapability("accounts.update", {
          resourceType: "account",
          resourceId: "neon-account-1",
        }),
      ).resolves.toMatchObject({ profile: { id: "actor-1" } });

      expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    });
  });

  it("maps outside-scope and capability denials to stable AdminErrors", async () => {
    installDatabaseRows({ departments: ["department-managed"] });
    await expect(
      requireCapability("users.manage", {
        departmentId: "department-other",
      }),
    ).rejects.toEqual(new AdminError("OUTSIDE_SCOPE", "Target is outside your management scope"));

    mocks.requireNeonAuthSession.mockResolvedValue(session("sales"));
    await expect(requireCapability("users.manage")).rejects.toEqual(
      new AdminError("FORBIDDEN", "You do not have this capability"),
    );
  });

  it("evaluates independently targeted capability checks from one authorization context", async () => {
    const appSession = session();
    mocks.requireNeonAuthSession.mockResolvedValue(appSession);

    await expect(
      requireCapabilityChecks([
        {
          capability: "leads.view",
          target: { departmentId: "department-home" },
        },
        { capability: "quotes.view" },
      ]),
    ).resolves.toBe(appSession);

    expect(mocks.requireNeonAuthSession).toHaveBeenCalledOnce();
  });
  it("evaluates required and optional capabilities from one authorization context", async () => {
    installDatabaseRows({
      overrides: [
        {
          profile_id: "actor-1",
          capability: "job_sheets.view",
          effect: "deny",
          department_id: null,
          team_id: null,
          resource_type: null,
          resource_id: null,
          expires_at: null,
          revoked_at: null,
        },
      ],
    });

    await expect(
      requireCapabilitySet(["accounts.view"], {
        optional: ["contacts.view", "job_sheets.view"],
      }),
    ).resolves.toEqual({
      "accounts.view": true,
      "contacts.view": true,
      "job_sheets.view": false,
    });
    expect(mocks.requireNeonAuthSession).toHaveBeenCalledOnce();
  });
  it("tries every capability, returns the first grant, and ignores supplied scope arrays", async () => {
    mocks.requireNeonAuthSession.mockResolvedValue(session("sales"));

    await expect(requireAnyCapability(["users.manage", "accounts.view"])).resolves.toMatchObject({
      profile: { id: "actor-1" },
    });
    expect(mocks.requireNeonAuthSession).toHaveBeenCalledOnce();

    mocks.requireNeonAuthSession.mockResolvedValue(session());
    await expect(
      requireAnyCapability(["users.manage", "teams.manage"], {
        teamId: "team-injected",
        managedTeamIds: ["team-injected"],
      } as never),
    ).rejects.toMatchObject({ code: "OUTSIDE_SCOPE" });
  });
});
