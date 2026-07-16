import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAnyCapabilityMock,
  requireCapabilityMock,
  listAdminUsersMock,
  getAdminOverviewMock,
  getAdminUserMock,
  updateAdminProfileMock,
  changeUserRoleMock,
  setUserStatusMock,
  setSessionInvalidBeforeMock,
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
    requireAnyCapabilityMock: vi.fn(),
    requireCapabilityMock: vi.fn(),
    listAdminUsersMock: vi.fn(),
    getAdminOverviewMock: vi.fn(),
    getAdminUserMock: vi.fn(),
    updateAdminProfileMock: vi.fn(),
    changeUserRoleMock: vi.fn(),
    setUserStatusMock: vi.fn(),
    setSessionInvalidBeforeMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireAnyCapability: requireAnyCapabilityMock,
  requireCapability: requireCapabilityMock,
}));

vi.mock("@/server/repositories/admin-users", () => ({
  listAdminUsers: listAdminUsersMock,
  getAdminOverview: getAdminOverviewMock,
  getAdminUser: getAdminUserMock,
  updateAdminProfile: updateAdminProfileMock,
  changeUserRole: changeUserRoleMock,
  setUserStatus: setUserStatusMock,
  setSessionInvalidBefore: setSessionInvalidBeforeMock,
  getUserWorkload: vi.fn(),
}));

function session(role: "super_admin" | "admin" | "manager" = "admin") {
  return {
    user: { id: "admin-1", email: "admin@example.com" },
    profile: {
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin User",
      role,
      status: "active",
    },
    session: {},
  };
}

describe("admin user server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAnyCapabilityMock.mockResolvedValue(session());
    requireCapabilityMock.mockResolvedValue(session());
    listAdminUsersMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });
    getAdminOverviewMock.mockResolvedValue({ activeUsers: 3 });
    getAdminUserMock.mockResolvedValue({ id: "profile-1" });
    updateAdminProfileMock.mockResolvedValue({ id: "profile-1" });
    changeUserRoleMock.mockResolvedValue({ id: "profile-1", role: "sales" });
    setUserStatusMock.mockResolvedValue({ id: "profile-1", status: "suspended" });
    setSessionInvalidBeforeMock.mockResolvedValue(undefined);
  });

  it("requires users.view for the directory and forwards filters", async () => {
    const { getAdminUsersFn } = await import("../admin-users");

    await getAdminUsersFn({ data: { search: "Person", page: 2, limit: 25 } });

    expect(requireCapabilityMock).toHaveBeenCalledWith("users.view");
    expect(listAdminUsersMock).toHaveBeenCalledWith({ search: "Person", page: 2, limit: 25 });
  });

  it("requires a scoped users.view target for a user detail", async () => {
    const { getAdminUserFn } = await import("../admin-users");

    await getAdminUserFn({ data: { profileId: "profile-1" } });

    expect(requireCapabilityMock).toHaveBeenCalledWith("users.view", { profileId: "profile-1" });
    expect(getAdminUserMock).toHaveBeenCalledWith("profile-1");
  });

  it("uses users.manage and the signed-in actor for profile updates", async () => {
    const { updateAdminUserFn } = await import("../admin-users");

    await updateAdminUserFn({
      data: {
        profileId: "profile-1",
        changes: { name: "Updated Name", timezone: "Asia/Hong_Kong" },
      },
    });

    expect(requireCapabilityMock).toHaveBeenCalledWith("users.manage", {
      profileId: "profile-1",
    });
    expect(updateAdminProfileMock).toHaveBeenCalledWith(
      "profile-1",
      { name: "Updated Name", timezone: "Asia/Hong_Kong" },
      "admin-1",
    );
  });

  it("blocks Admin and Manager role escalation before the repository", async () => {
    const { changeAdminUserRoleFn } = await import("../admin-users");

    await expect(
      changeAdminUserRoleFn({
        data: { profileId: "profile-1", role: "super_admin", reason: "Role promotion" },
      }),
    ).rejects.toThrow("Only a Super Admin may assign the Super Admin role");
    expect(changeUserRoleMock).not.toHaveBeenCalled();

    requireCapabilityMock.mockResolvedValue(session("manager"));
    await expect(
      changeAdminUserRoleFn({
        data: { profileId: "profile-1", role: "admin", reason: "Role promotion" },
      }),
    ).rejects.toThrow("Managers may assign operational roles only");
    expect(changeUserRoleMock).not.toHaveBeenCalled();
  });

  it("routes lifecycle and session actions to their dedicated capabilities", async () => {
    const {
      suspendAdminUserFn,
      reactivateAdminUserFn,
      deactivateAdminUserFn,
      revokeAdminUserSessionsFn,
    } = await import("../admin-users");

    await suspendAdminUserFn({ data: { profileId: "profile-1", reason: "Security leave" } });
    expect(requireCapabilityMock).toHaveBeenCalledWith("users.suspend", {
      profileId: "profile-1",
    });
    expect(setUserStatusMock).toHaveBeenCalledWith(
      "profile-1",
      "suspend",
      "Security leave",
      "admin-1",
    );

    await reactivateAdminUserFn({ data: { profileId: "profile-1", reason: "Return to work" } });
    expect(requireCapabilityMock).toHaveBeenCalledWith("users.manage", {
      profileId: "profile-1",
    });
    expect(setUserStatusMock).toHaveBeenCalledWith(
      "profile-1",
      "reactivate",
      "Return to work",
      "admin-1",
    );

    await deactivateAdminUserFn({ data: { profileId: "profile-1", reason: "Left company" } });
    expect(requireCapabilityMock).toHaveBeenCalledWith("users.deactivate", {
      profileId: "profile-1",
    });

    await revokeAdminUserSessionsFn({ data: { profileId: "profile-1" } });
    expect(requireCapabilityMock).toHaveBeenCalledWith("sessions.revoke", {
      profileId: "profile-1",
    });
    expect(setSessionInvalidBeforeMock).toHaveBeenCalledWith("profile-1", "admin-1");
  });

  it("uses any admin capability for navigation and overview", async () => {
    const { getAdminNavigationFn, getAdminOverviewFn } = await import("../admin-users");

    await getAdminNavigationFn({ data: undefined });
    await getAdminOverviewFn({ data: undefined });

    expect(requireAnyCapabilityMock).toHaveBeenCalledWith([
      "users.view",
      "teams.view",
      "permissions.view",
      "audit.view",
    ]);
    expect(getAdminOverviewMock).toHaveBeenCalled();
  });
});
