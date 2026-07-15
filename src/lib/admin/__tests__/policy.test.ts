import { describe, expect, it } from "vitest";
import { AdminError } from "../errors";
import { evaluateAuthorization } from "../policy";
import {
  accessRequestSchema,
  invitationInputSchema,
  nonEmptyReasonSchema,
  roleChangeSchema,
} from "../schemas";
import type { ActorAccessContext, UserRole } from "../types";

function actor(role: UserRole, overrides: Partial<ActorAccessContext> = {}): ActorAccessContext {
  return {
    profileId: "actor-1",
    role,
    status: "active",
    managedDepartmentIds: [],
    managedTeamIds: [],
    directReportIds: [],
    ...overrides,
  };
}

describe("evaluateAuthorization", () => {
  it.each([
    ["super_admin", "users.manage", true],
    ["admin", "users.manage", true],
    ["manager", "users.manage", true],
    ["sales", "users.manage", false],
    ["client_success", "engagements.update", true],
    ["accounting", "job_sheets.accept", true],
    ["read_only", "accounts.update", false],
  ] as const)("grants %s -> %s = %s", (role, capability, allowed) => {
    expect(evaluateAuthorization({ actor: actor(role), capability, target: {} }).allowed).toBe(
      allowed,
    );
  });

  it("limits managers to managed departments, teams, and direct reports", () => {
    const manager = actor("manager", {
      profileId: "manager-1",
      departmentId: "sales",
      managedDepartmentIds: ["sales"],
      managedTeamIds: ["enterprise"],
      directReportIds: ["sales-1"],
    });

    expect(
      evaluateAuthorization({
        actor: manager,
        capability: "users.manage",
        target: { profileId: "sales-1", role: "sales" },
      }),
    ).toEqual({ allowed: true, reason: "role_grant" });
    expect(
      evaluateAuthorization({
        actor: manager,
        capability: "users.manage",
        target: { departmentId: "finance" },
      }),
    ).toEqual({ allowed: false, reason: "outside_scope" });
    expect(
      evaluateAuthorization({
        actor: manager,
        capability: "users.manage",
        target: { teamId: "enterprise" },
      }).allowed,
    ).toBe(true);
  });

  it("never lets a manager manage an Admin or Super Admin", () => {
    const manager = actor("manager", { directReportIds: ["admin-1"] });
    expect(
      evaluateAuthorization({
        actor: manager,
        capability: "users.manage",
        target: { profileId: "admin-1", role: "admin" },
        overrides: [{ capability: "users.manage", effect: "allow" }],
      }),
    ).toEqual({ allowed: false, reason: "protected_role" });
  });

  it("uses deny before allow and role defaults", () => {
    expect(
      evaluateAuthorization({
        actor: actor("admin"),
        capability: "accounts.update",
        target: {},
        overrides: [
          { capability: "accounts.update", effect: "allow" },
          { capability: "accounts.update", effect: "deny" },
        ],
      }),
    ).toEqual({ allowed: false, reason: "explicit_deny" });
  });

  it("ignores expired and scope-mismatched overrides", () => {
    const result = evaluateAuthorization({
      actor: actor("read_only"),
      capability: "accounts.update",
      target: { resourceType: "account", resourceId: "account-2" },
      now: new Date("2026-07-15T00:00:00.000Z"),
      overrides: [
        {
          capability: "accounts.update",
          effect: "allow",
          resourceType: "account",
          resourceId: "account-1",
        },
        {
          capability: "accounts.update",
          effect: "allow",
          expiresAt: "2026-07-14T00:00:00.000Z",
        },
      ],
    });
    expect(result).toEqual({ allowed: false, reason: "role_denied" });
  });

  it("denies inactive actors before evaluating overrides", () => {
    expect(
      evaluateAuthorization({
        actor: actor("admin", { status: "suspended" }),
        capability: "users.manage",
        target: {},
        overrides: [{ capability: "users.manage", effect: "allow" }],
      }),
    ).toEqual({ allowed: false, reason: "inactive_actor" });
  });
});

describe("admin schemas and errors", () => {
  it("accepts valid invitations and rejects stale role names", () => {
    expect(
      invitationInputSchema.parse({
        email: "  Admin@Example.com ",
        role: "client_success",
        initialTeamIds: [],
      }),
    ).toMatchObject({ email: "admin@example.com", role: "client_success" });
    expect(() => invitationInputSchema.parse({ email: "admin@example.com", role: "cs" })).toThrow();
  });

  it("requires meaningful reasons and validates role changes", () => {
    expect(nonEmptyReasonSchema.safeParse("short").success).toBe(false);
    expect(
      roleChangeSchema.safeParse({
        profileId: "profile-1",
        role: "accounting",
        reason: "Role required for billing handoff",
      }).success,
    ).toBe(true);
  });

  it("requires exactly the requested access target", () => {
    expect(
      accessRequestSchema.safeParse({
        requestType: "capability",
        capability: "accounts.update",
        reason: "Needs account correction access",
      }).success,
    ).toBe(true);
    expect(
      accessRequestSchema.safeParse({
        requestType: "team",
        capability: "accounts.update",
        teamId: "7b1e92c4-b28d-4149-a1da-04c57e925311",
        reason: "Needs enterprise team access",
      }).success,
    ).toBe(false);
  });

  it("provides stable typed admin errors", () => {
    const error = new AdminError("LAST_SUPER_ADMIN", "Cannot demote the final Super Admin");
    expect(error).toMatchObject({
      name: "AdminError",
      code: "LAST_SUPER_ADMIN",
      message: "Cannot demote the final Super Admin",
    });
  });
});
