// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionOverrideRecord } from "@/server/repositories/admin-access";
import { EffectiveAccessTable } from "../effective-access-table";
import { PermissionOverrideDialog } from "../permission-override-dialog";

describe("PermissionOverrideDialog", () => {
  afterEach(() => cleanup());

  it("does not offer override creation outside Super Admin access", () => {
    render(
      <PermissionOverrideDialog
        open
        profileId="profile-1"
        profileName="Ada Wong"
        canCreateOverride={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("Super Admin");
    expect(screen.queryByRole("button", { name: "Create override" })).toBeNull();
  });

  it("requires a reason and expiry for temporary overrides", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const actor = userEvent.setup();

    render(
      <PermissionOverrideDialog
        open
        profileId="profile-1"
        profileName="Ada Wong"
        canCreateOverride
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await actor.click(screen.getByLabelText("Temporary override"));
    await actor.click(screen.getByRole("button", { name: "Create override" }));
    expect(screen.getByRole("alert").textContent).toContain("Reason is required");

    await actor.type(screen.getByLabelText("Override reason"), "Temporary account coverage");
    await actor.click(screen.getByRole("button", { name: "Create override" }));
    expect(screen.getByRole("alert").textContent).toContain("Expiry is required");

    await actor.type(screen.getByLabelText("Override expiry"), "2026-07-31T09:00");
    await actor.click(screen.getByRole("button", { name: "Create override" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "profile-1",
        reason: "Temporary account coverage",
        expiresAt: expect.stringMatching(/^2026-07-31T.*:00\.000Z$/),
      }),
    );
  });

  it("sends the four scope fields the policy engine already enforces", async () => {
    // `permissionOverrideSchema` accepts departmentId, teamId, resourceType and resourceId,
    // and `overrideIsActive` narrows on all four — but the dialog never sent them and the
    // route never forwarded them, so every override the product could create was org-wide
    // and unscoped: the broadest grant the engine supports, with no way to say so.
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const actor = userEvent.setup();

    render(
      <PermissionOverrideDialog
        open
        profileId="profile-1"
        profileName="Ada Wong"
        canCreateOverride
        departments={[{ id: "dept-1", name: "Sales" }]}
        teams={[{ id: "team-1", name: "Growth" }]}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText(/will apply everywhere in the organization/)).toBeTruthy();

    await actor.selectOptions(screen.getByLabelText("Override team scope"), "team-1");
    await actor.type(screen.getByLabelText("Override reason"), "Covering a leave of absence");
    await actor.click(screen.getByRole("button", { name: "Create override" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "profile-1",
        teamId: "team-1",
        departmentId: null,
        resourceType: null,
        resourceId: null,
      }),
    );
  });

  it("refuses a single record id with no resource type behind it", async () => {
    const onSubmit = vi.fn();
    const actor = userEvent.setup();

    render(
      <PermissionOverrideDialog
        open
        profileId="profile-1"
        profileName="Ada Wong"
        canCreateOverride
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    // Without a type the policy engine can never match the scope, so the grant would be
    // indistinguishable from an unscoped one except that it grants nothing.
    expect(screen.getByLabelText("Override resource id")).toHaveProperty("disabled", true);
    await actor.type(screen.getByLabelText("Override reason"), "Covering a leave of absence");
    await actor.selectOptions(screen.getByLabelText("Override resource type"), "account");
    await actor.type(screen.getByLabelText("Override resource id"), "account-1");
    await actor.selectOptions(screen.getByLabelText("Override resource type"), "");
    await actor.click(screen.getByRole("button", { name: "Create override" }));

    expect(screen.getByRole("alert").textContent).toContain("resource type");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows what an override is scoped to, so an exception is not read as a role", () => {
    render(
      <EffectiveAccessTable
        roleDefaults={[{ capability: "accounts.update", allowed: false }]}
        overrides={[
          {
            id: "override-2",
            reason: "Covering a leave of absence",
            grantedBy: "admin-1",
            createdAt: "2026-07-01T00:00:00.000Z",
            profileId: "profile-1",
            capability: "accounts.update",
            effect: "allow",
            departmentId: null,
            teamId: "team-1",
            resourceType: null,
            resourceId: null,
            expiresAt: null,
            revokedAt: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("Team team-1")).toBeTruthy();
    expect(screen.getByText("Allowed")).toBeTruthy();
  });

  it("offers a revoke control only when the actor may override permissions", () => {
    // `revokeAdminPermissionOverrideFn` existed and was imported by no route, so the history
    // table rendered a "Revoked" state nothing in the product could produce.
    const override = {
      id: "override-3",
      reason: "Covering a leave of absence",
      grantedBy: "admin-1",
      createdAt: "2026-07-01T00:00:00.000Z",
      profileId: "profile-1",
      capability: "accounts.update" as const,
      effect: "allow" as const,
      departmentId: null,
      teamId: null,
      resourceType: null,
      resourceId: null,
      expiresAt: null,
      revokedAt: null,
    };
    const onRevoke = vi.fn();

    const { rerender } = render(
      <EffectiveAccessTable
        roleDefaults={[{ capability: "accounts.update", allowed: false }]}
        overrides={[override]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();

    rerender(
      <EffectiveAccessTable
        roleDefaults={[{ capability: "accounts.update", allowed: false }]}
        overrides={[override]}
        onRevoke={onRevoke}
      />,
    );
    screen.getByRole("button", { name: "Revoke" }).click();
    expect(onRevoke).toHaveBeenCalledWith(override);
  });

  it("shows explicit deny as the effective result over a role grant", () => {
    const override: PermissionOverrideRecord = {
      id: "override-1",
      reason: "Contract restriction",
      grantedBy: "admin-1",
      createdAt: "2026-07-01T00:00:00.000Z",
      profileId: "profile-1",
      capability: "accounts.update",
      effect: "deny",
      departmentId: null,
      teamId: null,
      resourceType: null,
      resourceId: null,
      expiresAt: null,
      revokedAt: null,
    };

    render(
      <EffectiveAccessTable
        roleDefaults={[{ capability: "accounts.update", allowed: true }]}
        overrides={[override]}
      />,
    );

    expect(screen.getByText("Denied")).toBeTruthy();
    expect(screen.getByText("Explicit deny")).toBeTruthy();
  });
});
