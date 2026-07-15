import { describe, expect, it } from "vitest";
import { AdminError } from "../errors";
import { evaluateAuthorization, ROLE_GRANTS } from "../policy";
import {
  accessRequestSchema,
  invitationInputSchema,
  nonEmptyReasonSchema,
  roleChangeSchema,
} from "../schemas";
import { CAPABILITIES, USER_ROLES, type ActorAccessContext, type UserRole } from "../types";

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

  it("fails closed when a Manager profile target omits its role", () => {
    expect(
      evaluateAuthorization({
        actor: actor("manager", { directReportIds: ["target-1"] }),
        capability: "users.manage",
        target: { profileId: "target-1" },
        overrides: [
          {
            profileId: "actor-1",
            capability: "users.manage",
            effect: "allow",
          },
        ],
      }),
    ).toEqual({ allowed: false, reason: "invalid_target" });
  });
  it("never lets a manager manage an Admin or Super Admin", () => {
    const manager = actor("manager", { directReportIds: ["admin-1"] });
    expect(
      evaluateAuthorization({
        actor: manager,
        capability: "users.manage",
        target: { profileId: "admin-1", role: "admin" },
        overrides: [{ profileId: "manager-1", capability: "users.manage", effect: "allow" }],
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
          { profileId: "actor-1", capability: "accounts.update", effect: "allow" },
          { profileId: "actor-1", capability: "accounts.update", effect: "deny" },
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
          profileId: "actor-1",
          capability: "accounts.update",
          effect: "allow",
          resourceType: "account",
          resourceId: "account-1",
        },
        {
          profileId: "actor-1",
          capability: "accounts.update",
          effect: "allow",
          expiresAt: "2026-07-14T00:00:00.000Z",
        },
      ],
    });
    expect(result).toEqual({ allowed: false, reason: "role_denied" });
  });

  it("binds overrides to the actor and ignores revoked or malformed grants", () => {
    const base = {
      actor: actor("read_only"),
      capability: "accounts.update" as const,
      target: {},
      now: new Date("2026-07-15T00:00:00.000Z"),
    };

    expect(
      evaluateAuthorization({
        ...base,
        overrides: [
          {
            profileId: "another-user",
            capability: "accounts.update",
            effect: "allow",
          },
        ],
      }),
    ).toEqual({ allowed: false, reason: "role_denied" });

    expect(
      evaluateAuthorization({
        ...base,
        overrides: [
          {
            profileId: "actor-1",
            capability: "accounts.update",
            effect: "allow",
            revokedAt: "2026-07-14T00:00:00.000Z",
          },
          {
            profileId: "actor-1",
            capability: "accounts.update",
            effect: "allow",
            expiresAt: "not-a-date",
          },
        ],
      }),
    ).toEqual({ allowed: false, reason: "role_denied" });
  });

  it("applies an explicit actor-bound allow before Manager scope", () => {
    expect(
      evaluateAuthorization({
        actor: actor("manager", { managedDepartmentIds: ["sales"] }),
        capability: "accounts.update",
        target: { departmentId: "finance" },
        overrides: [
          {
            profileId: "actor-1",
            capability: "accounts.update",
            effect: "allow",
          },
        ],
      }),
    ).toEqual({ allowed: true, reason: "explicit_allow" });
  });

  it("locks the complete role and capability grant matrix", () => {
    expect(
      Object.fromEntries(
        USER_ROLES.map((role) => [
          role,
          CAPABILITIES.filter((capability) => ROLE_GRANTS[role].has(capability)),
        ]),
      ),
    ).toMatchInlineSnapshot(`
      {
        "accounting": [
          "accounts.view",
          "contacts.view",
          "tasks.view",
          "tasks.update",
          "quotes.view",
          "approvals.view",
          "engagements.view",
          "job_sheets.view",
          "job_sheets.accept",
          "job_sheets.update_billing",
          "reports.view",
          "products.view",
        ],
        "admin": [
          "users.view",
          "users.invite",
          "users.manage",
          "users.suspend",
          "users.deactivate",
          "teams.view",
          "teams.manage",
          "departments.manage",
          "permissions.view",
          "access_requests.decide",
          "sessions.revoke",
          "audit.view",
          "audit.export",
          "accounts.view",
          "accounts.create",
          "accounts.update",
          "leads.view",
          "leads.create",
          "leads.update",
          "leads.convert",
          "contacts.view",
          "contacts.create",
          "contacts.update",
          "contacts.delete",
          "campaigns.view",
          "campaigns.manage",
          "campaigns.import",
          "tasks.view",
          "tasks.create",
          "tasks.update",
          "quotes.view",
          "quotes.create",
          "quotes.update",
          "quotes.request_approval",
          "quotes.approve",
          "quotes.issue",
          "approvals.view",
          "approvals.decide",
          "engagements.view",
          "engagements.create",
          "engagements.update",
          "job_sheets.view",
          "job_sheets.accept",
          "job_sheets.update_billing",
          "reports.view",
          "agents.view",
          "agents.run",
          "products.view",
          "products.manage",
          "api_keys.manage",
          "automation.manage",
        ],
        "client_success": [
          "accounts.view",
          "accounts.update",
          "leads.view",
          "contacts.view",
          "contacts.create",
          "contacts.update",
          "campaigns.view",
          "campaigns.manage",
          "campaigns.import",
          "tasks.view",
          "tasks.create",
          "tasks.update",
          "quotes.view",
          "approvals.view",
          "engagements.view",
          "engagements.create",
          "engagements.update",
          "job_sheets.view",
          "reports.view",
          "agents.view",
          "agents.run",
          "products.view",
        ],
        "manager": [
          "users.view",
          "users.manage",
          "teams.view",
          "teams.manage",
          "permissions.view",
          "accounts.view",
          "accounts.create",
          "accounts.update",
          "leads.view",
          "leads.create",
          "leads.update",
          "leads.convert",
          "contacts.view",
          "contacts.create",
          "contacts.update",
          "campaigns.view",
          "campaigns.manage",
          "tasks.view",
          "tasks.create",
          "tasks.update",
          "quotes.view",
          "quotes.create",
          "quotes.update",
          "quotes.request_approval",
          "quotes.approve",
          "approvals.view",
          "approvals.decide",
          "engagements.view",
          "engagements.create",
          "engagements.update",
          "job_sheets.view",
          "reports.view",
          "agents.view",
          "agents.run",
          "products.view",
        ],
        "read_only": [
          "users.view",
          "teams.view",
          "accounts.view",
          "leads.view",
          "contacts.view",
          "campaigns.view",
          "tasks.view",
          "quotes.view",
          "approvals.view",
          "engagements.view",
          "job_sheets.view",
          "reports.view",
          "agents.view",
          "products.view",
        ],
        "sales": [
          "accounts.view",
          "accounts.create",
          "accounts.update",
          "leads.view",
          "leads.create",
          "leads.update",
          "leads.convert",
          "contacts.view",
          "contacts.create",
          "contacts.update",
          "campaigns.view",
          "tasks.view",
          "tasks.create",
          "tasks.update",
          "quotes.view",
          "quotes.create",
          "quotes.update",
          "quotes.request_approval",
          "approvals.view",
          "engagements.view",
          "job_sheets.view",
          "reports.view",
          "agents.view",
          "agents.run",
          "products.view",
        ],
        "super_admin": [
          "users.view",
          "users.invite",
          "users.manage",
          "users.suspend",
          "users.deactivate",
          "teams.view",
          "teams.manage",
          "departments.manage",
          "permissions.view",
          "permissions.override",
          "access_requests.decide",
          "sessions.revoke",
          "audit.view",
          "audit.export",
          "accounts.view",
          "accounts.create",
          "accounts.update",
          "leads.view",
          "leads.create",
          "leads.update",
          "leads.convert",
          "contacts.view",
          "contacts.create",
          "contacts.update",
          "contacts.delete",
          "campaigns.view",
          "campaigns.manage",
          "campaigns.import",
          "tasks.view",
          "tasks.create",
          "tasks.update",
          "quotes.view",
          "quotes.create",
          "quotes.update",
          "quotes.request_approval",
          "quotes.approve",
          "quotes.issue",
          "approvals.view",
          "approvals.decide",
          "engagements.view",
          "engagements.create",
          "engagements.update",
          "job_sheets.view",
          "job_sheets.accept",
          "job_sheets.update_billing",
          "reports.view",
          "agents.view",
          "agents.run",
          "products.view",
          "products.manage",
          "api_keys.manage",
          "automation.manage",
        ],
      }
    `);
  });
  it("denies inactive actors before evaluating overrides", () => {
    expect(
      evaluateAuthorization({
        actor: actor("admin", { status: "suspended" }),
        capability: "users.manage",
        target: {},
        overrides: [{ profileId: "manager-1", capability: "users.manage", effect: "allow" }],
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
