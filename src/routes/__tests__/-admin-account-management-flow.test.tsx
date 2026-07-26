import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminError } from "@/lib/admin/errors";

const SALES_TEAM_ID = "11111111-1111-4111-8111-111111111111";
const TEMP_TEAM_ID = "22222222-2222-4222-8222-222222222222";
const SALES_DEPARTMENT_ID = "33333333-3333-4333-8333-333333333333";

const { state, mocks, createServerFnChain } = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    state: {
      actorProfileId: "admin-1",
      actorRole: "admin" as "super_admin" | "admin" | "manager" | "sales",
      invitation: null as {
        id: string;
        email: string;
        intended_role: "sales";
        primary_department_id: string | null;
        manager_profile_id: string | null;
        initial_team_ids: string[];
        status: "pending" | "accepted";
        invited_by: string;
        expires_at: string;
      } | null,
      profiles: new Map<string, { id: string; email: string; role: string; status: string }>(),
      accessRequest: null as {
        id: string;
        requesterProfileId: string;
        requestType: "team";
        capability: null;
        teamId: string;
        reason: string;
        status: "pending" | "approved";
        accessExpiresAt: string | null;
      } | null,
      memberships: [] as Array<{
        teamId: string;
        profileId: string;
        endsAt: string | null;
      }>,
      overrides: [] as Array<{ profileId: string; capability: string; effect: "allow" | "deny" }>,
      sessionInvalidatedFor: new Set<string>(),
      auditLogs: [] as Array<{ actorProfileId: string; targetId: string; action: string }>,
    },
    mocks: {
      requireCapability: vi.fn(),
      requireAnyCapability: vi.fn(),
      requireNeonAuthIdentity: vi.fn(),
      requireNeonAuthSession: vi.fn(),
      createInvitation: vi.fn(),
      getInvitationPreview: vi.fn(),
      getInvitationById: vi.fn(),
      acceptInvitation: vi.fn(),
      resendInvitation: vi.fn(),
      revokeInvitation: vi.fn(),
      dispatchInvitationEmail: vi.fn(),
      listDepartmentsAndTeams: vi.fn(),
      createDepartment: vi.fn(),
      updateDepartment: vi.fn(),
      createTeam: vi.fn(),
      updateTeam: vi.fn(),
      upsertTeamMembership: vi.fn(),
      endTeamMembership: vi.fn(),
      listActiveOverrides: vi.fn(),
      listPermissionOverrideHistory: vi.fn(),
      listAccessRequests: vi.fn(),
      getAccessRequest: vi.fn(),
      createPermissionOverride: vi.fn(),
      revokePermissionOverride: vi.fn(),
      createAccessRequest: vi.fn(),
      decideAccessRequest: vi.fn(),
      createWorkDelegation: vi.fn(),
      cancelWorkDelegation: vi.fn(),
      listAdminAuditLogs: vi.fn(),
      listAdminUsers: vi.fn(),
      getAdminOverview: vi.fn(),
      getAdminUser: vi.fn(),
      updateAdminProfile: vi.fn(),
      changeUserRole: vi.fn(),
      setUserStatus: vi.fn(),
      setSessionInvalidBefore: vi.fn(),
      getReassignmentInventory: vi.fn(),
      deactivateUserWithReassignment: vi.fn(),
      updateAccount: vi.fn(),
    },
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain }));
vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: mocks.requireCapability,
  requireAnyCapability: mocks.requireAnyCapability,
}));
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthIdentity: mocks.requireNeonAuthIdentity,
  requireNeonAuthSession: mocks.requireNeonAuthSession,
}));
vi.mock("@/server/admin/invitation-email.server", () => ({
  dispatchInvitationEmail: mocks.dispatchInvitationEmail,
}));
vi.mock("@/server/repositories/admin-invitations", () => ({
  createInvitation: mocks.createInvitation,
  getInvitationPreview: mocks.getInvitationPreview,
  getInvitationById: mocks.getInvitationById,
  acceptInvitation: mocks.acceptInvitation,
  resendInvitation: mocks.resendInvitation,
  revokeInvitation: mocks.revokeInvitation,
}));
vi.mock("@/server/repositories/admin-teams", () => ({
  listDepartmentsAndTeams: mocks.listDepartmentsAndTeams,
  createDepartment: mocks.createDepartment,
  updateDepartment: mocks.updateDepartment,
  createTeam: mocks.createTeam,
  updateTeam: mocks.updateTeam,
  upsertTeamMembership: mocks.upsertTeamMembership,
  endTeamMembership: mocks.endTeamMembership,
}));
vi.mock("@/server/repositories/admin-access", () => ({
  listActiveOverrides: mocks.listActiveOverrides,
  listPermissionOverrideHistory: mocks.listPermissionOverrideHistory,
  listAccessRequests: mocks.listAccessRequests,
  getAccessRequest: mocks.getAccessRequest,
  createPermissionOverride: mocks.createPermissionOverride,
  revokePermissionOverride: mocks.revokePermissionOverride,
  createAccessRequest: mocks.createAccessRequest,
  decideAccessRequest: mocks.decideAccessRequest,
  createWorkDelegation: mocks.createWorkDelegation,
  cancelWorkDelegation: mocks.cancelWorkDelegation,
  listAdminAuditLogs: mocks.listAdminAuditLogs,
}));
vi.mock("@/server/repositories/admin-users", () => ({
  listAdminUsers: mocks.listAdminUsers,
  getAdminOverview: mocks.getAdminOverview,
  getAdminUser: mocks.getAdminUser,
  updateAdminProfile: mocks.updateAdminProfile,
  changeUserRole: mocks.changeUserRole,
  setUserStatus: mocks.setUserStatus,
  setSessionInvalidBefore: mocks.setSessionInvalidBefore,
  getUserWorkload: vi.fn(),
}));
vi.mock("@/server/admin/reassignment.server", () => ({
  REASSIGNMENT_BUCKETS: [{ key: "leads.assigned_to" }, { key: "tasks.assigned_to" }],
  getReassignmentInventory: mocks.getReassignmentInventory,
  deactivateUserWithReassignment: mocks.deactivateUserWithReassignment,
}));
vi.mock("@/server/repositories/accounts", () => ({
  createAccount: vi.fn(),
  getAccount: vi.fn(),
  getAccountWorkspaceData: vi.fn(),
  listAccounts: vi.fn(),
  updateAccount: mocks.updateAccount,
}));
vi.mock("@/server/repositories/agent-runs", () => ({
  createAgentRun: vi.fn(),
  findActiveRun: vi.fn(),
  updateAgentRunResult: vi.fn(),
}));
vi.mock("@/lib/n8n", () => ({
  getN8nDispatchConfig: vi.fn(),
  triggerN8n: vi.fn(),
}));
vi.mock("@/lib/workflows/payloads", () => ({ buildRelationshipIntelligencePayload: vi.fn() }));
vi.mock("@/lib/serializable", () => ({ serializeAgentRun: vi.fn() }));

import { updateAccount } from "@/server-functions/accounts";
import {
  acceptUserInvitation,
  getInvitationPreview,
  inviteUsers,
} from "@/server-functions/admin-invitations";
import {
  createAdminAccessRequestFn,
  createAdminPermissionOverrideFn,
  decideAdminAccessRequestFn,
} from "@/server-functions/admin-access";
import {
  changeAdminUserRoleFn,
  deactivateAdminUserWithReassignmentFn,
  getAdminReassignmentInventoryFn,
  suspendAdminUserFn,
} from "@/server-functions/admin-users";

function actorSession() {
  return {
    user: { id: state.actorProfileId, email: `${state.actorProfileId}@example.com` },
    profile: {
      id: state.actorProfileId,
      email: `${state.actorProfileId}@example.com`,
      name: "Test Operator",
      role: state.actorRole,
      status: "active",
    },
    session: {},
  };
}

beforeEach(() => {
  state.actorProfileId = "admin-1";
  state.actorRole = "admin";
  state.invitation = null;
  state.profiles.clear();
  state.accessRequest = null;
  state.memberships.length = 0;
  state.overrides.length = 0;
  state.sessionInvalidatedFor.clear();
  state.auditLogs.length = 0;

  vi.clearAllMocks();
  mocks.requireAnyCapability.mockResolvedValue(actorSession());
  mocks.requireCapability.mockImplementation(
    async (
      capability: string,
      target?: { profileId?: string; resourceType?: string; resourceId?: string },
    ) => {
      if (
        state.actorRole === "manager" &&
        capability === "users.manage" &&
        target?.profileId === "cross-department"
      ) {
        throw new AdminError("OUTSIDE_SCOPE", "User is outside your management scope");
      }
      if (
        capability === "accounts.update" &&
        state.overrides.some(
          (override) =>
            override.profileId === state.actorProfileId &&
            override.capability === capability &&
            override.effect === "deny" &&
            (!target?.resourceType || target.resourceType === "account") &&
            (!target?.resourceId || target.resourceId === "account-1"),
        )
      ) {
        throw new AdminError("FORBIDDEN", "Capability denied by explicit override");
      }
      return actorSession();
    },
  );
  mocks.requireNeonAuthIdentity.mockResolvedValue({
    user: { id: "profile-sales", email: "sales@example.com", name: "Sales User" },
    session: {},
  });
  mocks.requireNeonAuthSession.mockImplementation(async () => {
    if (state.sessionInvalidatedFor.has(state.actorProfileId)) {
      throw new AdminError("UNAUTHENTICATED", "Session is no longer valid");
    }
    return actorSession();
  });
  mocks.dispatchInvitationEmail.mockResolvedValue({ delivered: false, reason: "missing_webhook" });
  mocks.createInvitation.mockImplementation(
    async (
      input: {
        email: string;
        intendedRole: "sales";
        primaryDepartmentId: string | null;
        managerProfileId: string | null;
        initialTeamIds: string[];
      },
      actor: string,
    ) => {
      state.invitation = {
        id: "invite-1",
        email: input.email,
        intended_role: input.intendedRole,
        primary_department_id: input.primaryDepartmentId,
        manager_profile_id: input.managerProfileId,
        initial_team_ids: input.initialTeamIds,
        status: "pending",
        invited_by: actor,
        expires_at: "2026-07-25T00:00:00.000Z",
      };
      return { invitation: state.invitation, rawToken: "matching-token" };
    },
  );
  mocks.getInvitationPreview.mockImplementation(async () => {
    if (!state.invitation) throw new AdminError("CONFLICT", "Invitation not found");
    return {
      email: state.invitation.email,
      intendedRole: state.invitation.intended_role,
      expiresAt: state.invitation.expires_at,
      status: state.invitation.status,
    };
  });
  mocks.acceptInvitation.mockImplementation(
    async (token: string, identity: { id: string; email: string }) => {
      if (
        !state.invitation ||
        token !== "matching-token" ||
        identity.email !== state.invitation.email
      ) {
        throw new AdminError("FORBIDDEN", "Invitation identity does not match");
      }
      state.invitation.status = "accepted";
      const profile = {
        id: identity.id,
        email: identity.email,
        role: state.invitation.intended_role,
        status: "active",
      };
      state.profiles.set(profile.id, profile);
      state.memberships.push(
        ...state.invitation.initial_team_ids.map((teamId) => ({
          teamId,
          profileId: profile.id,
          endsAt: null,
        })),
      );
      state.auditLogs.push({
        actorProfileId: identity.id,
        targetId: state.invitation.id,
        action: "invitation.accepted",
      });
      return profile;
    },
  );
  mocks.getInvitationById.mockImplementation(async () => state.invitation);
  mocks.upsertTeamMembership.mockImplementation(
    async (input: { teamId: string; profileId: string; endsAt?: string }, actor: string) => {
      state.memberships.push({
        teamId: input.teamId,
        profileId: input.profileId,
        endsAt: input.endsAt ?? null,
      });
      state.auditLogs.push({
        actorProfileId: actor,
        targetId: input.profileId,
        action: "team_membership.created",
      });
      return { id: "membership-1" };
    },
  );
  mocks.createAccessRequest.mockImplementation(
    async (input: { requestType: "team"; teamId: string; reason: string }, requester: string) => {
      state.accessRequest = {
        id: "request-1",
        requesterProfileId: requester,
        requestType: input.requestType,
        capability: null,
        teamId: input.teamId,
        reason: input.reason,
        status: "pending",
        accessExpiresAt: null,
      };
      return state.accessRequest;
    },
  );
  mocks.getAccessRequest.mockImplementation(async () => state.accessRequest);
  mocks.decideAccessRequest.mockImplementation(
    async (
      input: { id: string; decision: "approved"; accessExpiresAt?: string },
      actor: string,
    ) => {
      if (!state.accessRequest || input.id !== state.accessRequest.id) {
        throw new AdminError("CONFLICT", "Access request not found");
      }
      state.accessRequest.status = input.decision;
      state.accessRequest.accessExpiresAt = input.accessExpiresAt ?? null;
      if (input.decision === "approved") {
        state.memberships.push({
          teamId: state.accessRequest.teamId,
          profileId: state.accessRequest.requesterProfileId,
          endsAt: input.accessExpiresAt ?? null,
        });
      }
      state.auditLogs.push({
        actorProfileId: actor,
        targetId: input.id,
        action: "access_request.approved",
      });
      return state.accessRequest;
    },
  );
  mocks.createPermissionOverride.mockImplementation(
    async (
      input: { profileId: string; capability: string; effect: "allow" | "deny" },
      actor: string,
    ) => {
      state.overrides.push(input);
      state.auditLogs.push({
        actorProfileId: actor,
        targetId: input.profileId,
        action: "permission_override.created",
      });
      return input;
    },
  );
  mocks.setUserStatus.mockImplementation(
    async (
      profileId: string,
      action: "suspend" | "deactivate" | "reactivate",
      reason: string,
      actor: string,
    ) => {
      const profile = state.profiles.get(profileId) ?? {
        id: profileId,
        email: "person@example.com",
        role: "sales",
        status: "active",
      };
      profile.status =
        action === "suspend" ? "suspended" : action === "deactivate" ? "deactivated" : "active";
      state.profiles.set(profileId, profile);
      if (action !== "reactivate") state.sessionInvalidatedFor.add(profileId);
      state.auditLogs.push({
        actorProfileId: actor,
        targetId: profileId,
        action: `profile.status_${action}:${reason}`,
      });
      return profile;
    },
  );
  mocks.setSessionInvalidBefore.mockImplementation(async (profileId: string, actor: string) => {
    state.sessionInvalidatedFor.add(profileId);
    state.auditLogs.push({
      actorProfileId: actor,
      targetId: profileId,
      action: "profile.sessions_invalidated",
    });
  });
  mocks.changeUserRole.mockImplementation(
    async (profileId: string, role: string, reason: string, actor: string) => {
      const profile = state.profiles.get(profileId) ?? {
        id: profileId,
        email: "person@example.com",
        role: "sales",
        status: "active",
      };
      profile.role = role;
      state.profiles.set(profileId, profile);
      state.auditLogs.push({
        actorProfileId: actor,
        targetId: profileId,
        action: `profile.role_changed:${reason}`,
      });
      return profile;
    },
  );
  mocks.getReassignmentInventory.mockResolvedValue({
    profileId: "profile-sales",
    buckets: [
      { key: "leads.assigned_to", table: "leads", column: "assigned_to", label: "Leads", count: 2 },
      { key: "tasks.assigned_to", table: "tasks", column: "assigned_to", label: "Tasks", count: 1 },
    ],
    totalCount: 3,
  });
  mocks.deactivateUserWithReassignment.mockImplementation(
    async (
      input: {
        profileId: string;
        reason: string;
        reviewedInventory: unknown;
        successors: Record<string, string>;
      },
      actor: string,
    ) => {
      if (input.profileId === "final-super-admin") {
        throw new AdminError("LAST_SUPER_ADMIN", "Cannot deactivate the last active Super Admin");
      }
      state.sessionInvalidatedFor.add(input.profileId);
      state.auditLogs.push({
        actorProfileId: actor,
        targetId: input.profileId,
        action: `profile.deactivated:${input.reason}`,
      });
      return { profileId: input.profileId, status: "deactivated", reassigned: input.successors };
    },
  );
  mocks.updateAccount.mockResolvedValue({ id: "account-1" });
});

describe("admin account management user stories", () => {
  it("invites a Sales user, previews the invitation, and activates the matching identity", async () => {
    const result = await inviteUsers({
      data: {
        invitations: [
          {
            email: "Sales@Example.com",
            role: "sales",
            primaryDepartmentId: SALES_DEPARTMENT_ID,
            initialTeamIds: [SALES_TEAM_ID],
          },
        ],
      },
    });

    expect(result[0]).toMatchObject({
      inviteUrl: expect.stringContaining("/invite/matching-token"),
    });
    await expect(
      getInvitationPreview({ data: { token: "matching-token" } }),
    ).resolves.toMatchObject({
      email: "sales@example.com",
      status: "pending",
    });

    await expect(
      acceptUserInvitation({ data: { token: "matching-token" } }),
    ).resolves.toMatchObject({
      id: "profile-sales",
      role: "sales",
      status: "active",
    });
    expect(state.memberships).toContainEqual({
      teamId: SALES_TEAM_ID,
      profileId: "profile-sales",
      endsAt: null,
    });
    expect(state.auditLogs).toContainEqual({
      actorProfileId: "profile-sales",
      targetId: "invite-1",
      action: "invitation.accepted",
    });
  });

  it("lets a Manager change a Sales direct report but forbids a cross-department target", async () => {
    state.actorProfileId = "manager-1";
    state.actorRole = "manager";
    state.profiles.set("profile-sales", {
      id: "profile-sales",
      email: "sales@example.com",
      role: "sales",
      status: "active",
    });

    await expect(
      changeAdminUserRoleFn({
        data: { profileId: "profile-sales", role: "client_success", reason: "Coverage change" },
      }),
    ).resolves.toMatchObject({ role: "client_success" });

    await expect(
      changeAdminUserRoleFn({
        data: {
          profileId: "cross-department",
          role: "client_success",
          reason: "Cross-team change",
        },
      }),
    ).rejects.toMatchObject({ code: "OUTSIDE_SCOPE" });
    expect(mocks.changeUserRole).toHaveBeenCalledTimes(1);
  });

  it("approves temporary team access with the configured expiry", async () => {
    state.actorProfileId = "profile-sales";
    state.actorRole = "sales";
    await createAdminAccessRequestFn({
      data: { requestType: "team", teamId: TEMP_TEAM_ID, reason: "Cover the launch team" },
    });

    state.actorProfileId = "manager-1";
    state.actorRole = "manager";
    const accessExpiresAt = "2026-08-01T00:00:00.000Z";
    await decideAdminAccessRequestFn({
      data: {
        id: "request-1",
        decision: "approved",
        reason: "Launch coverage approved",
        accessExpiresAt,
      },
    });

    expect(state.memberships).toContainEqual({
      teamId: TEMP_TEAM_ID,
      profileId: "profile-sales",
      endsAt: accessExpiresAt,
    });
    expect(mocks.requireCapability).toHaveBeenLastCalledWith("access_requests.decide", {
      teamId: TEMP_TEAM_ID,
    });
  });

  it("keeps an explicit deny effective even when the target role otherwise grants the capability", async () => {
    state.actorProfileId = "profile-deny";
    state.actorRole = "sales";
    await createAdminPermissionOverrideFn({
      data: {
        profileId: "profile-deny",
        capability: "accounts.update",
        effect: "deny",
        reason: "Protect strategic account ownership",
      },
    });

    await expect(
      updateAccount({ data: { id: "account-1", updates: { name: "Blocked update" } } }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.updateAccount).not.toHaveBeenCalled();
  });

  it("rejects an old session after an Admin suspends the user", async () => {
    state.profiles.set("profile-sales", {
      id: "profile-sales",
      email: "sales@example.com",
      role: "sales",
      status: "active",
    });
    await suspendAdminUserFn({ data: { profileId: "profile-sales", reason: "Security review" } });

    state.actorProfileId = "profile-sales";
    state.actorRole = "sales";
    await expect(
      updateAccount({ data: { id: "account-1", updates: { name: "Stale session" } } }),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(state.profiles.get("profile-sales")?.status).toBe("suspended");
  });

  it("requires workload review and preserves the acting Admin in deactivation history", async () => {
    const inventory = await getAdminReassignmentInventoryFn({
      data: { profileId: "profile-sales" },
    });
    const result = await deactivateAdminUserWithReassignmentFn({
      data: {
        profileId: "profile-sales",
        reason: "Planned departure",
        reviewedInventory: inventory,
        successors: {
          "leads.assigned_to": "replacement-1",
          "tasks.assigned_to": "replacement-1",
        },
      },
    });

    expect(result).toMatchObject({ profileId: "profile-sales", status: "deactivated" });
    expect(mocks.deactivateUserWithReassignment).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: "profile-sales", successors: expect.any(Object) }),
      "admin-1",
    );
    expect(state.auditLogs).toContainEqual(
      expect.objectContaining({ actorProfileId: "admin-1", targetId: "profile-sales" }),
    );
  });

  it("returns LAST_SUPER_ADMIN when attempting to deactivate the final active Super Admin", async () => {
    state.actorProfileId = "root-operator";
    state.actorRole = "super_admin";

    await expect(
      deactivateAdminUserWithReassignmentFn({
        data: {
          profileId: "final-super-admin",
          reason: "Remove final administrator",
          reviewedInventory: {
            profileId: "final-super-admin",
            buckets: [],
            totalCount: 0,
          },
          successors: {},
        },
      }),
    ).rejects.toMatchObject({ code: "LAST_SUPER_ADMIN" });
  });
});
