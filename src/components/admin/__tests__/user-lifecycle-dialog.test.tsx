// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminError } from "@/lib/admin/errors";
import {
  REASSIGNMENT_BUCKETS,
  type ReassignmentInventory,
} from "@/server/admin/reassignment.server";
import { UserLifecycleDialog } from "../user-lifecycle-dialog";

const user = {
  id: "target",
  name: "Ada Wong",
  email: "ada@example.com",
  role: "sales" as const,
  status: "active" as const,
};

function inventory(counts: Record<string, number>): ReassignmentInventory {
  const buckets = REASSIGNMENT_BUCKETS.map((bucket) => ({
    ...bucket,
    count: counts[bucket.key] ?? 0,
  }));
  return {
    profileId: "target",
    buckets,
    totalCount: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
  };
}

const successors = [
  { id: "successor", name: "Grace Hopper", email: "grace@example.com", status: "active" as const },
];

describe("UserLifecycleDialog", () => {
  afterEach(() => cleanup());
  it("requires a reason before suspending a user", async () => {
    const submit = vi.fn();
    const actor = userEvent.setup();

    render(
      <UserLifecycleDialog
        open
        user={user}
        onOpenChange={vi.fn()}
        onSubmit={submit}
        inventory={inventory({})}
        successors={successors}
      />,
    );

    await actor.click(screen.getByRole("button", { name: "Suspend user" }));

    expect(screen.getByRole("alert").textContent).toContain("Enter a reason");
    expect(submit).not.toHaveBeenCalled();
  });

  it("can restore a suspended user, which nothing in the product could do before", async () => {
    // `reactivateAdminUserFn` has existed and been authorized on `users.manage` since the
    // admin module shipped, and no route imported it — so a suspended person could not be
    // restored from any screen. `lifecycleActionSchema` already named "reactivate".
    const submit = vi.fn().mockResolvedValue(undefined);
    const actor = userEvent.setup();

    render(
      <UserLifecycleDialog
        open
        user={{ ...user, status: "suspended" }}
        initialAction="reactivate"
        canReactivate
        canSuspend
        onOpenChange={vi.fn()}
        onSubmit={submit}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("restores app access");
    await actor.type(screen.getByLabelText("Reason"), "Returned from leave");
    await actor.click(screen.getByRole("button", { name: "Reactivate user" }));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reactivate", profileId: "target" }),
    );
  });

  it("offers only reactivation to an actor who cannot suspend or deactivate", () => {
    // `users.manage` extends to Manager; `users.suspend` and `users.deactivate` do not. A
    // manager reaching this dialog must not be shown two branches the server will refuse.
    render(
      <UserLifecycleDialog
        open
        user={{ ...user, status: "suspended" }}
        initialAction="reactivate"
        canReactivate
        canSuspend={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Reactivate" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
  });

  it("tells the admin the inventory is loading rather than telling them to load it", () => {
    // A pending fetch and a failed fetch used to collapse into the same undefined, so during
    // a normal load the dialog instructed the admin to perform an action they could not
    // perform while the submit button sat disabled with no reason given.
    const { rerender } = render(
      <UserLifecycleDialog
        open
        user={user}
        initialAction="deactivate"
        inventoryLoading
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText(/Loading this user's ownership inventory/)).toBeTruthy();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();

    rerender(
      <UserLifecycleDialog
        open
        user={user}
        initialAction="deactivate"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    // Load finished with nothing: that is a failure, and it says so and blocks the write.
    expect(screen.getByText(/could not be loaded, so deactivation is blocked/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deactivate user" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("blocks deactivation until every open bucket has a successor", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const actor = userEvent.setup();

    render(
      <UserLifecycleDialog
        open
        user={user}
        initialAction="deactivate"
        onOpenChange={vi.fn()}
        onSubmit={submit}
        inventory={inventory({ "tasks.assigned_to": 2 })}
        successors={successors}
      />,
    );

    expect(screen.getByText("Tasks")).toBeTruthy();
    const submitButton = screen.getByRole("button", { name: "Deactivate user" });
    expect(submitButton.hasAttribute("disabled")).toBe(true);

    await actor.selectOptions(screen.getByLabelText("Successor for Tasks"), "successor");
    await actor.type(screen.getByLabelText("Reason"), "Planned departure");
    expect(submitButton.hasAttribute("disabled")).toBe(false);

    await actor.click(submitButton);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "deactivate",
        profileId: "target",
        successors: { "tasks.assigned_to": "successor" },
      }),
    );
  });

  it("keeps a final-Super-Admin error visible without closing", async () => {
    const submit = vi
      .fn()
      .mockRejectedValue(
        new AdminError("LAST_SUPER_ADMIN", "Cannot deactivate the last active Super Admin"),
      );
    const actor = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <UserLifecycleDialog
        open
        user={{ ...user, role: "super_admin" }}
        initialAction="deactivate"
        onOpenChange={onOpenChange}
        onSubmit={submit}
        inventory={inventory({})}
        successors={successors}
      />,
    );

    await actor.type(screen.getByLabelText("Reason"), "Planned departure");
    await actor.click(screen.getByRole("button", { name: "Deactivate user" }));

    expect((await screen.findByRole("alert")).textContent).toContain("last active Super Admin");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
