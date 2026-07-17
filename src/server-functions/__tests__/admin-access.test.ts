import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireCapabilityMock,
  requireNeonAuthSessionMock,
  listActiveOverridesMock,
  listPermissionOverrideHistoryMock,
  listAccessRequestsMock,
  getAccessRequestMock,
  createPermissionOverrideMock,
  revokePermissionOverrideMock,
  createAccessRequestMock,
  decideAccessRequestMock,
  createWorkDelegationMock,
  cancelWorkDelegationMock,
  listAdminAuditLogsMock,
  createServerFnChain,
} = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };
  return {
    requireCapabilityMock: vi.fn(),
    requireNeonAuthSessionMock: vi.fn(),
    listActiveOverridesMock: vi.fn(),
    listPermissionOverrideHistoryMock: vi.fn(),
    listAccessRequestsMock: vi.fn(),
    getAccessRequestMock: vi.fn(),
    createPermissionOverrideMock: vi.fn(),
    revokePermissionOverrideMock: vi.fn(),
    createAccessRequestMock: vi.fn(),
    decideAccessRequestMock: vi.fn(),
    createWorkDelegationMock: vi.fn(),
    cancelWorkDelegationMock: vi.fn(),
    listAdminAuditLogsMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain }));
vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: requireCapabilityMock,
}));
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));
vi.mock("@/server/repositories/admin-access", () => ({
  listActiveOverrides: listActiveOverridesMock,
  listPermissionOverrideHistory: listPermissionOverrideHistoryMock,
  listAccessRequests: listAccessRequestsMock,
  getAccessRequest: getAccessRequestMock,
  createPermissionOverride: createPermissionOverrideMock,
  revokePermissionOverride: revokePermissionOverrideMock,
  createAccessRequest: createAccessRequestMock,
  decideAccessRequest: decideAccessRequestMock,
  createWorkDelegation: createWorkDelegationMock,
  cancelWorkDelegation: cancelWorkDelegationMock,
  listAdminAuditLogs: listAdminAuditLogsMock,
}));

function session() {
  return {
    user: { id: "admin-1" },
    profile: { id: "admin-1", role: "admin", status: "active" },
    session: {},
  };
}

describe("admin access server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCapabilityMock.mockResolvedValue(session());
    requireNeonAuthSessionMock.mockResolvedValue(session());
    listActiveOverridesMock.mockResolvedValue([]);
    listPermissionOverrideHistoryMock.mockResolvedValue([]);
    listAccessRequestsMock.mockResolvedValue([]);
    getAccessRequestMock.mockResolvedValue({
      id: "request-1",
      requesterProfileId: "profile-2",
      requestType: "capability",
      capability: "accounts.update",
      teamId: null,
      reason: "Need access",
      status: "pending",
      decidedBy: null,
      decisionReason: null,
      decidedAt: null,
      accessExpiresAt: null,
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    });
    createPermissionOverrideMock.mockResolvedValue({ profileId: "profile-1" });
    revokePermissionOverrideMock.mockResolvedValue(undefined);
    createAccessRequestMock.mockResolvedValue({ id: "request-1" });
    decideAccessRequestMock.mockResolvedValue({ id: "request-1" });
    createWorkDelegationMock.mockResolvedValue({ id: "delegation-1" });
    cancelWorkDelegationMock.mockResolvedValue(undefined);
    listAdminAuditLogsMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });
  });

  it("scopes permission overrides to the target profile", async () => {
    const {
      getAdminOverridesFn,
      createAdminPermissionOverrideFn,
      revokeAdminPermissionOverrideFn,
    } = await import("../admin-access");

    await getAdminOverridesFn({ data: { profileId: "profile-1" } });
    expect(requireCapabilityMock).toHaveBeenCalledWith("permissions.view", {
      profileId: "profile-1",
    });
    expect(listActiveOverridesMock).toHaveBeenCalledWith("profile-1");

    await createAdminPermissionOverrideFn({
      data: {
        profileId: "profile-1",
        capability: "accounts.update",
        effect: "allow",
        reason: "Temporary access",
      },
    });
    expect(requireCapabilityMock).toHaveBeenCalledWith("permissions.override", {
      profileId: "profile-1",
    });
    expect(createPermissionOverrideMock).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: "profile-1" }),
      "admin-1",
    );

    await revokeAdminPermissionOverrideFn({ data: { id: "override-1" } });
    expect(revokePermissionOverrideMock).toHaveBeenCalledWith("override-1", "admin-1");
  });

  it("creates own access requests and uses decision capability for approvals", async () => {
    const { createAdminAccessRequestFn, decideAdminAccessRequestFn } =
      await import("../admin-access");

    await createAdminAccessRequestFn({
      data: { requestType: "capability", capability: "accounts.update", reason: "Need access" },
    });

    expect(createAccessRequestMock).toHaveBeenCalledWith(
      { requestType: "capability", capability: "accounts.update", reason: "Need access" },
      "admin-1",
    );

    await decideAdminAccessRequestFn({
      data: { id: "request-1", decision: "approved", reason: "Approved access" },
    });
    expect(requireCapabilityMock).toHaveBeenCalledWith("access_requests.decide", {});
    expect(decideAccessRequestMock).toHaveBeenCalledWith(
      { id: "request-1", decision: "approved", reason: "Approved access" },
      "admin-1",
    );
  });

  it("limits managers to scoped team decisions and blocks capability grants", async () => {
    const { decideAdminAccessRequestFn } = await import("../admin-access");
    requireCapabilityMock.mockResolvedValue({
      ...session(),
      profile: { ...session().profile, role: "manager" },
    });

    await expect(
      decideAdminAccessRequestFn({
        data: { id: "request-1", decision: "approved", reason: "Capability escalation" },
      }),
    ).rejects.toThrow("Managers can only decide team access requests");
    expect(decideAccessRequestMock).not.toHaveBeenCalled();

    getAccessRequestMock.mockResolvedValue({
      id: "request-1",
      requesterProfileId: "profile-2",
      requestType: "team",
      capability: null,
      teamId: "team-1",
      reason: "Need team access",
      status: "pending",
      decidedBy: null,
      decisionReason: null,
      decidedAt: null,
      accessExpiresAt: null,
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    });

    await decideAdminAccessRequestFn({
      data: { id: "request-1", decision: "approved", reason: "Team coverage approved" },
    });
    expect(requireCapabilityMock).toHaveBeenLastCalledWith("access_requests.decide", {
      teamId: "team-1",
    });
    expect(decideAccessRequestMock).toHaveBeenLastCalledWith(
      { id: "request-1", decision: "approved", reason: "Team coverage approved" },
      "admin-1",
    );
  });
  it("routes delegations and audit queries through their capabilities", async () => {
    const { createAdminWorkDelegationFn, cancelAdminWorkDelegationFn, getAdminAuditLogsFn } =
      await import("../admin-access");

    await createAdminWorkDelegationFn({
      data: {
        delegatorProfileId: "admin-1",
        delegateProfileId: "profile-2",
        startsAt: "2026-07-20T00:00:00.000Z",
        endsAt: "2026-07-25T00:00:00.000Z",
        reason: "Annual leave coverage",
      },
    });
    expect(requireCapabilityMock).toHaveBeenCalledWith("users.manage", { profileId: "admin-1" });
    expect(createWorkDelegationMock).toHaveBeenCalledWith(
      expect.objectContaining({ delegateProfileId: "profile-2" }),
      "admin-1",
    );

    await cancelAdminWorkDelegationFn({ data: { id: "delegation-1" } });
    expect(cancelWorkDelegationMock).toHaveBeenCalledWith("delegation-1", "admin-1");

    await getAdminAuditLogsFn({ data: { page: 1, limit: 25, severity: "warning" } });
    expect(requireCapabilityMock).toHaveBeenCalledWith("audit.view");
    expect(listAdminAuditLogsMock).toHaveBeenCalledWith({
      page: 1,
      limit: 25,
      severity: "warning",
    });
  });
});
