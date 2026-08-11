// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserProfileDialog } from "../user-profile-dialog";

const user = {
  id: "target",
  name: "Ada Wong",
  email: "ada@example.com",
  jobTitle: "Account Director",
  phone: null,
  locale: "en-HK",
  timezone: "Asia/Hong_Kong",
  primaryDepartmentId: "dept-1",
  managerProfileId: null,
};

const departments = [
  { id: "dept-1", name: "Client Services", status: "active" },
  { id: "dept-2", name: "Media", status: "active" },
];

const managers = [
  { id: "target", name: "Ada Wong", email: "ada@example.com" },
  { id: "manager-1", name: "Grace Hopper", email: "grace@example.com" },
];

function renderDialog(submit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <UserProfileDialog
      open
      user={user}
      departments={departments}
      managers={managers}
      onOpenChange={vi.fn()}
      onSubmit={submit}
    />,
  );
  return submit;
}

describe("UserProfileDialog", () => {
  afterEach(() => cleanup());

  it("sends only the fields that changed", async () => {
    const submit = renderDialog();
    const actor = userEvent.setup();

    await actor.selectOptions(screen.getByLabelText("Manager"), "manager-1");
    await actor.click(screen.getByRole("button", { name: "Save profile" }));

    // Untouched locale/timezone/name must not be resent — a partial update is the whole point of
    // `changes` being optional on the server schema.
    expect(submit).toHaveBeenCalledWith({ managerProfileId: "manager-1" });
  });

  it("does not offer the member as their own manager", () => {
    renderDialog();

    const options = Array.from(
      screen.getByLabelText<HTMLSelectElement>("Manager").options,
      (option) => option.value,
    );
    expect(options).not.toContain("target");
    expect(options).toContain("manager-1");
  });

  it("clears a department by sending null", async () => {
    const submit = renderDialog();
    const actor = userEvent.setup();

    await actor.selectOptions(screen.getByLabelText("Department"), "");
    await actor.click(screen.getByRole("button", { name: "Save profile" }));

    expect(submit).toHaveBeenCalledWith({ primaryDepartmentId: null });
  });

  it("refuses to remove a name that is already set", async () => {
    const submit = renderDialog();
    const actor = userEvent.setup();

    await actor.clear(screen.getByLabelText("Name"));
    await actor.click(screen.getByRole("button", { name: "Save profile" }));

    expect(screen.getByRole("alert").textContent).toContain("cannot be removed");
    expect(submit).not.toHaveBeenCalled();
  });

  it("requires at least one change", async () => {
    const submit = renderDialog();
    const actor = userEvent.setup();

    await actor.click(screen.getByRole("button", { name: "Save profile" }));

    expect(screen.getByRole("alert").textContent).toContain("Change at least one field");
    expect(submit).not.toHaveBeenCalled();
  });

  it("keeps an off-list timezone selectable so saving cannot silently rewrite it", () => {
    render(
      <UserProfileDialog
        open
        user={{ ...user, timezone: "Pacific/Auckland" }}
        departments={departments}
        managers={managers}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const select = screen.getByLabelText<HTMLSelectElement>("Timezone");
    expect(select.value).toBe("Pacific/Auckland");
  });

  it("keeps an archived department selectable when the member is already in it", () => {
    render(
      <UserProfileDialog
        open
        user={user}
        departments={[{ id: "dept-1", name: "Client Services (archived)", status: "archived" }]}
        managers={managers}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText<HTMLSelectElement>("Department").value).toBe("dept-1");
  });
});
