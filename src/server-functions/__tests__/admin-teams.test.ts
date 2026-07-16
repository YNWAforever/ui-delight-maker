import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireCapabilityMock,
  requireAnyCapabilityMock,
  listDepartmentsAndTeamsMock,
  createDepartmentMock,
  updateDepartmentMock,
  createTeamMock,
  updateTeamMock,
  upsertTeamMembershipMock,
  endTeamMembershipMock,
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
    requireAnyCapabilityMock: vi.fn(),
    listDepartmentsAndTeamsMock: vi.fn(),
    createDepartmentMock: vi.fn(),
    updateDepartmentMock: vi.fn(),
    createTeamMock: vi.fn(),
    updateTeamMock: vi.fn(),
    upsertTeamMembershipMock: vi.fn(),
    endTeamMembershipMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain }));
vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: requireCapabilityMock,
  requireAnyCapability: requireAnyCapabilityMock,
}));
vi.mock("@/server/repositories/admin-teams", () => ({
  listDepartmentsAndTeams: listDepartmentsAndTeamsMock,
  createDepartment: createDepartmentMock,
  updateDepartment: updateDepartmentMock,
  createTeam: createTeamMock,
  updateTeam: updateTeamMock,
  upsertTeamMembership: upsertTeamMembershipMock,
  endTeamMembership: endTeamMembershipMock,
}));

function session() {
  return {
    user: { id: "admin-1" },
    profile: { id: "admin-1", role: "admin", status: "active" },
    session: {},
  };
}

describe("admin team server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCapabilityMock.mockResolvedValue(session());
    requireAnyCapabilityMock.mockResolvedValue(session());
    listDepartmentsAndTeamsMock.mockResolvedValue({ departments: [], teams: [], memberships: [] });
    createDepartmentMock.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" });
    updateDepartmentMock.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" });
    createTeamMock.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    updateTeamMock.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    upsertTeamMembershipMock.mockResolvedValue({ id: "membership-1" });
    endTeamMembershipMock.mockResolvedValue(undefined);
  });

  it("requires teams.view for the organization directory", async () => {
    const { getAdminOrganizationFn } = await import("../admin-teams");
    await getAdminOrganizationFn({ data: undefined });
    expect(requireCapabilityMock).toHaveBeenCalledWith("teams.view");
    expect(listDepartmentsAndTeamsMock).toHaveBeenCalled();
  });

  it("uses scoped capabilities for department and team mutations", async () => {
    const { createDepartmentFn, updateDepartmentFn, createTeamFn, updateTeamFn } =
      await import("../admin-teams");

    await createDepartmentFn({ data: { name: "Sales" } });
    expect(requireCapabilityMock).toHaveBeenCalledWith("departments.manage");
    expect(createDepartmentMock).toHaveBeenCalledWith({ name: "Sales" }, "admin-1");

    await updateDepartmentFn({
      data: { id: "22222222-2222-4222-8222-222222222222", input: { name: "Revenue" } },
    });
    expect(requireCapabilityMock).toHaveBeenCalledWith("departments.manage", {
      departmentId: "22222222-2222-4222-8222-222222222222",
    });

    await createTeamFn({ data: { name: "Growth" } });
    expect(requireCapabilityMock).toHaveBeenCalledWith("teams.manage");
    expect(createTeamMock).toHaveBeenCalledWith({ name: "Growth" }, "admin-1");

    await updateTeamFn({
      data: { id: "11111111-1111-4111-8111-111111111111", input: { name: "Growth Ops" } },
    });
    expect(requireCapabilityMock).toHaveBeenCalledWith("teams.manage", {
      teamId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("scopes membership changes to the team and passes the actor", async () => {
    const { upsertAdminTeamMembershipFn, endAdminTeamMembershipFn } =
      await import("../admin-teams");

    await upsertAdminTeamMembershipFn({
      data: {
        teamId: "11111111-1111-4111-8111-111111111111",
        profileId: "profile-1",
        membershipRole: "member",
      },
    });
    expect(requireCapabilityMock).toHaveBeenCalledWith("teams.manage", {
      teamId: "11111111-1111-4111-8111-111111111111",
      profileId: "profile-1",
    });
    expect(upsertTeamMembershipMock).toHaveBeenCalledWith(
      {
        teamId: "11111111-1111-4111-8111-111111111111",
        profileId: "profile-1",
        membershipRole: "member",
      },
      "admin-1",
    );

    await endAdminTeamMembershipFn({
      data: {
        teamId: "11111111-1111-4111-8111-111111111111",
        profileId: "profile-1",
        endedAt: "2026-07-30T00:00:00.000Z",
      },
    });
    expect(endTeamMembershipMock).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "profile-1",
      "2026-07-30T00:00:00.000Z",
      "admin-1",
    );
  });
});
