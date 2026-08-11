// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkDelegationDialog } from "../work-delegation-dialog";

const user = {
  id: "target",
  name: "Ada Wong",
  email: "ada@example.com",
  availabilityStatus: "on_leave",
  leaveStartsAt: "2026-09-01T00:00:00.000Z",
  leaveEndsAt: "2026-09-14T00:00:00.000Z",
};

const candidates = [
  { id: "target", name: "Ada Wong", email: "ada@example.com" },
  { id: "cover-1", name: "Grace Hopper", email: "grace@example.com" },
];

function renderDialog(submit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <WorkDelegationDialog
      open
      user={user}
      candidates={candidates}
      onOpenChange={vi.fn()}
      onSubmit={submit}
    />,
  );
  return submit;
}

function setRange(startLocal: string, endLocal: string) {
  fireEvent.change(screen.getByLabelText("Starts"), { target: { value: startLocal } });
  fireEvent.change(screen.getByLabelText("Ends"), { target: { value: endLocal } });
}

describe("WorkDelegationDialog", () => {
  afterEach(() => cleanup());

  it("does not offer the member as their own delegate", () => {
    renderDialog();

    const options = Array.from(
      screen.getByLabelText<HTMLSelectElement>("Delegate to").options,
      (option) => option.value,
    );
    expect(options).not.toContain("target");
    expect(options).toContain("cover-1");
  });

  it("submits ISO instants, not the raw datetime-local value", async () => {
    const submit = renderDialog();
    const actor = userEvent.setup();

    await actor.selectOptions(screen.getByLabelText("Delegate to"), "cover-1");
    setRange("2026-09-01T09:00", "2026-09-14T18:00");
    await actor.type(screen.getByLabelText("Delegation reason"), "Annual leave cover");
    await actor.click(screen.getByRole("button", { name: "Create delegation" }));

    expect(submit).toHaveBeenCalledTimes(1);
    const input = submit.mock.calls[0][0];
    expect(input.delegatorProfileId).toBe("target");
    expect(input.delegateProfileId).toBe("cover-1");
    // delegationSchema uses z.iso.datetime(), which rejects "2026-09-01T09:00".
    expect(input.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(input.endsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(input.endsAt).getTime()).toBeGreaterThan(new Date(input.startsAt).getTime());
  });

  it("rejects an end that is not after the start", async () => {
    const submit = renderDialog();
    const actor = userEvent.setup();

    await actor.selectOptions(screen.getByLabelText("Delegate to"), "cover-1");
    setRange("2026-09-14T18:00", "2026-09-01T09:00");
    await actor.type(screen.getByLabelText("Delegation reason"), "Annual leave cover");
    await actor.click(screen.getByRole("button", { name: "Create delegation" }));

    expect(screen.getByRole("alert").textContent).toContain("after the start");
    expect(submit).not.toHaveBeenCalled();
  });

  it("requires a delegate", async () => {
    const submit = renderDialog();
    const actor = userEvent.setup();

    setRange("2026-09-01T09:00", "2026-09-14T18:00");
    await actor.type(screen.getByLabelText("Delegation reason"), "Annual leave cover");
    await actor.click(screen.getByRole("button", { name: "Create delegation" }));

    expect(screen.getByRole("alert").textContent).toContain("who will cover");
    expect(submit).not.toHaveBeenCalled();
  });

  it("requires a reason of at least eight characters", async () => {
    const submit = renderDialog();
    const actor = userEvent.setup();

    await actor.selectOptions(screen.getByLabelText("Delegate to"), "cover-1");
    setRange("2026-09-01T09:00", "2026-09-14T18:00");
    await actor.type(screen.getByLabelText("Delegation reason"), "leave");
    await actor.click(screen.getByRole("button", { name: "Create delegation" }));

    expect(screen.getByRole("alert").textContent).toContain("eight characters");
    expect(submit).not.toHaveBeenCalled();
  });

  it("shows the recorded leave window as context", () => {
    renderDialog();

    expect(screen.getByRole("status").textContent).toContain("Recorded leave");
  });
});
