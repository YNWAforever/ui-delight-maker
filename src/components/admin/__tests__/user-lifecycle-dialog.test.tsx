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
