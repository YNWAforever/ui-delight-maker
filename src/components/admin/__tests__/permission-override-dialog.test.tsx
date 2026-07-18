// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionOverride } from "@/lib/admin/types";
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

  it("shows explicit deny as the effective result over a role grant", () => {
    const override: PermissionOverride = {
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
