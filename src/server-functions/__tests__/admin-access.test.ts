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
vi.mock("@/server/repositories/admin-users", () => ({
  getProfileRole: vi.fn(async () => "sales"),
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
    // The target carries the delegator's current role: the policy denies a manager checking
    // users.manage against a role-less target, and needs the role to apply `protected_role`.
    expect(requireCapabilityMock).toHaveBeenCalledWith("users.manage", {
      profileId: "admin-1",
      role: "sales",
    });
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

  /**
   * Approving a capability request writes an unscoped, non-expiring `allow` override, and the
   * policy consults overrides before ROLE_GRANTS. That makes the decision a grant of the same
   * weight as `createAdminPermissionOverrideFn`, and it has to be gated like one — otherwise an
   * admin can request `permissions.override` (the single capability ROLE_GRANTS.admin
   * withholds), approve their own request, and hold every capability in the system.
   */
  describe("capability access requests cannot be used to escalate", () => {
    it("refuses to create a request for a non-requestable capability", async () => {
      const { createAdminAccessRequestFn } = await import("../admin-access");

      await expect(
        createAdminAccessRequestFn({
          data: {
            requestType: "capability",
            capability: "permissions.override",
            reason: "break glass access",
          },
        }),
      ).rejects.toThrow();

      expect(createAccessRequestMock).not.toHaveBeenCalled();
    });

    it("refuses to grant a non-requestable capability even if a request row exists", async () => {
      // Belt and braces: the schema blocks the request, and the decision blocks the grant, so a
      // row written before this rule existed still cannot be approved.
      const { decideAdminAccessRequestFn } = await import("../admin-access");
      getAccessRequestMock.mockResolvedValue({
        id: "request-legacy",
        requesterProfileId: "profile-2",
        requestType: "capability",
        capability: "permissions.override",
        teamId: null,
        status: "pending",
      });

      await expect(
        decideAdminAccessRequestFn({
          data: { id: "request-legacy", decision: "approved", reason: "Approving anyway" },
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(decideAccessRequestMock).not.toHaveBeenCalled();
    });

    it("refuses to let the requester decide their own request", async () => {
      const { decideAdminAccessRequestFn } = await import("../admin-access");
      getAccessRequestMock.mockResolvedValue({
        id: "request-self",
        requesterProfileId: "admin-1",
        requestType: "capability",
        capability: "accounts.update",
        teamId: null,
        status: "pending",
      });

      await expect(
        decideAdminAccessRequestFn({
          data: { id: "request-self", decision: "approved", reason: "Approved by me" },
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(decideAccessRequestMock).not.toHaveBeenCalled();
    });

    it("refuses to grant a capability the decider does not hold", async () => {
      const { decideAdminAccessRequestFn } = await import("../admin-access");
      requireCapabilityMock.mockImplementation(async (capability: string) => {
        if (capability === "accounts.update") throw new Error("not held");
        return session();
      });

      await expect(
        decideAdminAccessRequestFn({
          data: { id: "request-1", decision: "approved", reason: "Team coverage approved" },
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(decideAccessRequestMock).not.toHaveBeenCalled();
    });

    it("still approves an ordinary request from someone else by a decider who holds it", async () => {
      const { decideAdminAccessRequestFn } = await import("../admin-access");

      await decideAdminAccessRequestFn({
        data: { id: "request-1", decision: "approved", reason: "Coverage approved" },
      });

      expect(decideAccessRequestMock).toHaveBeenCalledWith(
        { id: "request-1", decision: "approved", reason: "Coverage approved" },
        "admin-1",
      );
    });

    it("does not require the capability to reject", async () => {
      // Rejection grants nothing, so it must not need the capability being declined.
      const { decideAdminAccessRequestFn } = await import("../admin-access");
      requireCapabilityMock.mockImplementation(async (capability: string) => {
        if (capability === "accounts.update") throw new Error("not held");
        return session();
      });

      await decideAdminAccessRequestFn({
        data: { id: "request-1", decision: "rejected", reason: "Not needed for this role" },
      });

      expect(decideAccessRequestMock).toHaveBeenCalled();
    });
  });
});
