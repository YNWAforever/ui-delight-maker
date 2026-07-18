import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireNeonAuthSessionMock,
  getAdminUserMock,
  updateMyProfileRecordMock,
  updateMyAvailabilityRecordMock,
  setSessionInvalidBeforeMock,
  getUserWorkloadMock,
  createWorkDelegationMock,
  cancelWorkDelegationMock,
  cancelMyDelegationMock,
  createAccessRequestMock,
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
    requireNeonAuthSessionMock: vi.fn(),
    getAdminUserMock: vi.fn(),
    updateMyProfileRecordMock: vi.fn(),
    updateMyAvailabilityRecordMock: vi.fn(),
    setSessionInvalidBeforeMock: vi.fn(),
    getUserWorkloadMock: vi.fn(),
    createWorkDelegationMock: vi.fn(),
    cancelWorkDelegationMock: vi.fn(),
    cancelMyDelegationMock: vi.fn(),
    createAccessRequestMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));

vi.mock("@/server/repositories/admin-users", () => ({
  getAdminUser: getAdminUserMock,
  setSessionInvalidBefore: setSessionInvalidBeforeMock,
  getUserWorkload: getUserWorkloadMock,
}));

vi.mock("@/server/repositories/account", () => ({
  updateMyProfile: updateMyProfileRecordMock,
  updateMyAvailability: updateMyAvailabilityRecordMock,
  listMyDelegations: vi.fn(),
  cancelMyDelegation: cancelMyDelegationMock,
  listMyAccessRequests: vi.fn(),
}));

vi.mock("@/server/repositories/admin-access", () => ({
  createWorkDelegation: createWorkDelegationMock,
  cancelWorkDelegation: cancelWorkDelegationMock,
  createAccessRequest: createAccessRequestMock,
}));

function session() {
  return {
    user: { id: "profile-1", email: "person@example.com", name: "Person" },
    session: { id: "session-1", createdAt: "2026-07-18T00:00:00.000Z" },
    profile: {
      id: "profile-1",
      email: "person@example.com",
      name: "Person",
      role: "sales",
      status: "active",
    },
  };
}

describe("account self-service server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireNeonAuthSessionMock.mockResolvedValue(session());
    getAdminUserMock.mockResolvedValue({ id: "profile-1", status: "active" });
    updateMyProfileRecordMock.mockResolvedValue({ id: "profile-1", name: "Updated" });
    updateMyAvailabilityRecordMock.mockResolvedValue({
      id: "profile-1",
      availability_status: "away",
    });
    setSessionInvalidBeforeMock.mockResolvedValue(undefined);
    getUserWorkloadMock.mockResolvedValue({
      openTasks: 2,
      assignedLeads: 3,
      ownedAccounts: 1,
      ownedClients: 1,
      ownedQuotes: 2,
      ownedJobSheets: 1,
    });
    createWorkDelegationMock.mockResolvedValue({ id: "delegation-1" });
    cancelWorkDelegationMock.mockResolvedValue(undefined);
    cancelMyDelegationMock.mockResolvedValue(undefined);
    createAccessRequestMock.mockResolvedValue({ id: "request-1" });
  });

  it("derives profile updates from the session and rejects actor spoofing", async () => {
    const { updateMyProfile } = await import("../account");

    await updateMyProfile({
      data: {
        name: "Updated",
        job_title: "Account Lead",
        phone: "+852 5555 1234",
        avatar_url: "https://cdn.example.com/avatar.png",
        locale: "en-HK",
        timezone: "Asia/Hong_Kong",
      },
    });

    expect(updateMyProfileRecordMock).toHaveBeenCalledWith(
      "profile-1",
      {
        name: "Updated",
        jobTitle: "Account Lead",
        phone: "+852 5555 1234",
        avatarUrl: "https://cdn.example.com/avatar.png",
        locale: "en-HK",
        timezone: "Asia/Hong_Kong",
      },
      "profile-1",
    );

    await expect(
      updateMyProfile({
        data: { actorId: "attacker", name: "Spoofed" },
      }),
    ).rejects.toThrow();
    expect(updateMyProfileRecordMock).toHaveBeenCalledTimes(1);
  });

  it("validates timezone and ordered leave dates", async () => {
    const { updateMyProfile, updateMyAvailability } = await import("../account");

    await expect(updateMyProfile({ data: { timezone: "Mars/Colony" } })).rejects.toThrow(
      "Invalid timezone",
    );

    await expect(
      updateMyAvailability({
        data: {
          availability_status: "away",
          leave_starts_at: "2026-08-10T00:00:00.000Z",
          leave_ends_at: "2026-08-09T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow("leave_ends_at must be after leave_starts_at");
  });

  it("allows delegation only to active users and cancels only own delegations", async () => {
    const { createMyDelegation, cancelMyDelegation } = await import("../account");
    getAdminUserMock.mockResolvedValueOnce({ id: "delegate-1", status: "suspended" });

    await expect(
      createMyDelegation({
        data: {
          delegateProfileId: "delegate-1",
          startsAt: "2026-08-10T00:00:00.000Z",
          endsAt: "2026-08-12T00:00:00.000Z",
          reason: "Annual leave coverage",
        },
      }),
    ).rejects.toThrow("Delegation target must be active");
    expect(createWorkDelegationMock).not.toHaveBeenCalled();

    getAdminUserMock.mockResolvedValueOnce({ id: "delegate-1", status: "active" });
    await createMyDelegation({
      data: {
        delegateProfileId: "delegate-1",
        startsAt: "2026-08-10T00:00:00.000Z",
        endsAt: "2026-08-12T00:00:00.000Z",
        reason: "Annual leave coverage",
      },
    });
    expect(createWorkDelegationMock).toHaveBeenCalledWith(
      {
        delegatorProfileId: "profile-1",
        delegateProfileId: "delegate-1",
        startsAt: "2026-08-10T00:00:00.000Z",
        endsAt: "2026-08-12T00:00:00.000Z",
        reason: "Annual leave coverage",
      },
      "profile-1",
    );

    await cancelMyDelegation({ data: { id: "delegation-1" } });
    expect(cancelMyDelegationMock).toHaveBeenCalledWith("delegation-1", "profile-1", "profile-1");
  });

  it("invalidates the current user's app sessions and scopes workload to that user", async () => {
    const { revokeMyAppSessions, getMyWorkload } = await import("../account");

    await revokeMyAppSessions({ data: {} });
    expect(setSessionInvalidBeforeMock).toHaveBeenCalledWith("profile-1", "profile-1");

    await expect(getMyWorkload()).resolves.toEqual({
      openTasks: 2,
      assignedLeads: 3,
      ownedAccounts: 1,
      ownedClients: 1,
      ownedQuotes: 2,
      ownedJobSheets: 1,
    });
    expect(getUserWorkloadMock).toHaveBeenCalledWith("profile-1");
  });

  it("requires a meaningful reason for self-service access requests", async () => {
    const { createMyAccessRequest } = await import("../account");

    await expect(
      createMyAccessRequest({
        data: {
          requestType: "capability",
          capability: "accounts.update",
          reason: "short",
        },
      }),
    ).rejects.toThrow();

    await createMyAccessRequest({
      data: {
        requestType: "capability",
        capability: "accounts.update",
        reason: "Need account update access",
      },
    });
    expect(createAccessRequestMock).toHaveBeenCalledWith(
      {
        requestType: "capability",
        capability: "accounts.update",
        reason: "Need account update access",
      },
      "profile-1",
    );
  });
});
