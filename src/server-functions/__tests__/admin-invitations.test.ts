import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireCapabilityMock,
  requireNeonAuthIdentityMock,
  createInvitationMock,
  getInvitationPreviewMock,
  getInvitationByIdMock,
  acceptInvitationMock,
  resendInvitationMock,
  revokeInvitationMock,
  dispatchInvitationEmailMock,
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
    requireNeonAuthIdentityMock: vi.fn(),
    createInvitationMock: vi.fn(),
    getInvitationPreviewMock: vi.fn(),
    getInvitationByIdMock: vi.fn(),
    acceptInvitationMock: vi.fn(),
    resendInvitationMock: vi.fn(),
    revokeInvitationMock: vi.fn(),
    dispatchInvitationEmailMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: requireCapabilityMock,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthIdentity: requireNeonAuthIdentityMock,
}));

vi.mock("@/server/repositories/admin-invitations", () => ({
  createInvitation: createInvitationMock,
  getInvitationPreview: getInvitationPreviewMock,
  getInvitationById: getInvitationByIdMock,
  acceptInvitation: acceptInvitationMock,
  resendInvitation: resendInvitationMock,
  revokeInvitation: revokeInvitationMock,
}));

vi.mock("@/server/admin/invitation-email.server", () => ({
  dispatchInvitationEmail: dispatchInvitationEmailMock,
}));

const invitation = {
  id: "invite-1",
  email: "person@example.com",
  intended_role: "sales",
  primary_department_id: null,
  manager_profile_id: null,
  initial_team_ids: [],
  status: "pending",
  invited_by: "admin-1",
  expires_at: "2026-07-23T00:00:00.000Z",
};

function session(role: "super_admin" | "admin" | "manager") {
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

describe("admin invitation server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_BASE_URL", "https://clientops.example.com");
    requireCapabilityMock.mockResolvedValue(session("admin"));
    requireNeonAuthIdentityMock.mockResolvedValue({
      user: { id: "profile-1", email: "person@example.com", name: "Person" },
      session: {},
    });
    createInvitationMock.mockResolvedValue({ invitation, rawToken: "raw-token" });
    getInvitationByIdMock.mockResolvedValue(invitation);
    getInvitationPreviewMock.mockResolvedValue({
      email: "person@example.com",
      intendedRole: "sales",
      expiresAt: invitation.expires_at,
      status: "pending",
    });
    acceptInvitationMock.mockResolvedValue({
      id: "profile-1",
      email: "person@example.com",
      role: "sales",
      status: "active",
    });
    resendInvitationMock.mockResolvedValue({ invitation, rawToken: "new-raw-token" });
    revokeInvitationMock.mockResolvedValue({ ...invitation, status: "revoked" });
    dispatchInvitationEmailMock.mockResolvedValue({
      delivered: false,
      reason: "missing_webhook",
    });
  });

  it("requires users.invite and returns a copyable link even when delivery is unavailable", async () => {
    const { inviteUsers } = await import("../admin-invitations");

    const result = await inviteUsers({
      data: {
        invitations: [
          {
            email: "Person@Example.com",
            role: "sales",
            initialTeamIds: [],
          },
        ],
      },
    });

    expect(requireCapabilityMock).toHaveBeenCalledWith("users.invite");
    expect(createInvitationMock).toHaveBeenCalledWith(
      {
        email: "person@example.com",
        intendedRole: "sales",
        primaryDepartmentId: null,
        managerProfileId: null,
        initialTeamIds: [],
      },
      "admin-1",
    );
    expect(result[0]).toMatchObject({
      invitation,
      inviteUrl: "https://clientops.example.com/invite/raw-token",
      delivery: { delivered: false, reason: "missing_webhook" },
    });
  });

  it("allows only a Super Admin to invite another Super Admin", async () => {
    const { inviteUsers } = await import("../admin-invitations");

    await expect(
      inviteUsers({
        data: {
          invitations: [{ email: "root@example.com", role: "super_admin", initialTeamIds: [] }],
        },
      }),
    ).rejects.toThrow("Only a Super Admin may invite another Super Admin");
    expect(createInvitationMock).not.toHaveBeenCalled();

    requireCapabilityMock.mockResolvedValue(session("super_admin"));
    await expect(
      inviteUsers({
        data: {
          invitations: [{ email: "root@example.com", role: "super_admin", initialTeamIds: [] }],
        },
      }),
    ).resolves.toHaveLength(1);
  });

  it("limits manager invitations to lower roles and passes scope targets to authorization", async () => {
    requireCapabilityMock.mockResolvedValue(session("manager"));
    const { inviteUsers } = await import("../admin-invitations");

    await inviteUsers({
      data: {
        invitations: [
          {
            email: "sales@example.com",
            role: "sales",
            primaryDepartmentId: "sales-dept",
            managerProfileId: "admin-1",
            initialTeamIds: ["11111111-1111-4111-8111-111111111111"],
          },
        ],
      },
    });

    expect(requireCapabilityMock).toHaveBeenCalledWith("users.invite", {
      role: "sales",
      departmentId: "sales-dept",
      teamId: "11111111-1111-4111-8111-111111111111",
      ownerProfileId: "admin-1",
    });

    await expect(
      inviteUsers({
        data: {
          invitations: [{ email: "admin2@example.com", role: "admin", initialTeamIds: [] }],
        },
      }),
    ).rejects.toThrow("Managers may invite operational roles only");
  });

  it("previews invitations without requiring an active business profile", async () => {
    const { getInvitationPreview } = await import("../admin-invitations");

    await expect(getInvitationPreview({ data: { token: "raw-token" } })).resolves.toMatchObject({
      email: "person@example.com",
      intendedRole: "sales",
    });
    expect(requireCapabilityMock).not.toHaveBeenCalled();
    expect(requireNeonAuthIdentityMock).not.toHaveBeenCalled();
  });

  it("accepts using auth identity and never requires an admin capability", async () => {
    const { acceptUserInvitation } = await import("../admin-invitations");

    await acceptUserInvitation({ data: { token: "raw-token" } });

    expect(requireNeonAuthIdentityMock).toHaveBeenCalled();
    expect(requireCapabilityMock).not.toHaveBeenCalled();
    expect(acceptInvitationMock).toHaveBeenCalledWith("raw-token", {
      id: "profile-1",
      email: "person@example.com",
      name: "Person",
    });
  });

  it("authorizes resend and revoke operations", async () => {
    const { resendUserInvitation, revokeUserInvitation } = await import("../admin-invitations");

    const resent = await resendUserInvitation({ data: { invitationId: "invite-1" } });
    await revokeUserInvitation({ data: { invitationId: "invite-1" } });

    expect(requireCapabilityMock).toHaveBeenCalledWith("users.invite");
    expect(requireCapabilityMock).toHaveBeenCalledWith("users.invite", {
      role: "sales",
      departmentId: undefined,
      teamId: undefined,
      ownerProfileId: "admin-1",
    });
    expect(resendInvitationMock).toHaveBeenCalledWith("invite-1", "admin-1");
    expect(resent.inviteUrl).toBe("https://clientops.example.com/invite/new-raw-token");
    expect(revokeInvitationMock).toHaveBeenCalledWith("invite-1", "admin-1");
  });
});
