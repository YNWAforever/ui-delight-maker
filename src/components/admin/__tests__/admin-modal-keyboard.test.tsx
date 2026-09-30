// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserRoleDialog } from "../user-role-dialog";
import { UserLifecycleDialog } from "../user-lifecycle-dialog";

afterEach(cleanup);

function Harness({ kind, submit }: { kind: "role" | "lifecycle"; submit: () => unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open selected person {kind}</button>
      <button>Outside action</button>
      {kind === "role" ? (
        <UserRoleDialog
          open={open}
          currentRole="sales"
          userName="Synthetic Ada"
          onOpenChange={setOpen}
          onSubmit={submit}
        />
      ) : (
        <UserLifecycleDialog
          open={open}
          user={{
            id: "synthetic-person",
            name: "Synthetic Ada",
            email: "ada@example.test",
            role: "sales",
            status: "active",
          }}
          onOpenChange={setOpen}
          onSubmit={submit}
        />
      )}
    </>
  );
}

describe.each(["role", "lifecycle"] as const)("selected-person %s modal keyboard", (kind) => {
  it("moves focus inside, contains forward/reverse Tab and returns the exact trigger on Escape without a write", async () => {
    const actor = userEvent.setup(),
      submit = vi.fn();
    render(<Harness kind={kind} submit={submit} />);
    const trigger = screen.getByRole("button", { name: "Open selected person " + kind });
    await actor.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let index = 0; index < 12; index++) {
      await actor.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let index = 0; index < 12; index++) {
      await actor.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await actor.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(submit).not.toHaveBeenCalled();
  });

  it("keeps a readable validation error in the modal and allows Escape recovery with no command", async () => {
    const actor = userEvent.setup(),
      submit = vi.fn();
    render(<Harness kind={kind} submit={submit} />);
    const trigger = screen.getByRole("button", { name: "Open selected person " + kind });
    await actor.click(trigger);
    const dialog = screen.getByRole("dialog");
    if (kind === "role")
      await actor.selectOptions(
        within(dialog).getByRole("combobox", { name: "New role" }),
        "manager",
      );
    await actor.click(
      within(dialog).getByRole("button", { name: kind === "role" ? "Save role" : "Suspend user" }),
    );
    expect(within(dialog).getByRole("alert").textContent).toMatch(/reason/i);
    await actor.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(submit).not.toHaveBeenCalled();
  });
});
