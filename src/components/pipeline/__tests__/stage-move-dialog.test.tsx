// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { StageMoveDialog } from "../stage-move-dialog";
import type { Lead } from "@/lib/types";

const lead: Lead = {
  id: "lead-1",
  contact_id: null,
  account_id: null,
  source_campaign_id: null,
  campaign_member_id: null,
  company_name: "Northstar Retail",
  contact_name: "Ada Chan",
  contact_email: "ada@northstar.example",
  contact_phone: null,
  source: "website",
  status: "approved",
  assigned_to: null,
  lead_score: 82,
  qualification_data: null,
  enquiry_text: "Needs a retainer",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

type DialogProps = ComponentProps<typeof StageMoveDialog>;

function renderDialog(overrides: Partial<DialogProps> = {}) {
  const props: DialogProps = {
    lead,
    nextStatus: "won",
    reason: "Client accepted the proposal",
    submitting: false,
    onReasonChange: vi.fn(),
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
  const view = render(<StageMoveDialog {...props} />);
  return { ...view, props };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StageMoveDialog", () => {
  it("stays open after confirm so a failed move cannot look like a successful one", () => {
    // Radix closes an AlertDialogAction's dialog on click. Without the preventDefault in
    // the component the panel vanished while the write was still in flight, so a rejected
    // move produced exactly what a successful one did: no dialog, no message, no change.
    // The caller closes it, and only once the write has settled.
    const { props } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Confirm move" }));

    expect(props.onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByText("Confirm stage change")).toBeTruthy();
  });

  it("refuses a second confirm while the move is in flight", () => {
    // A stage move writes an activity log entry as well as the status, so a second
    // confirm races the first and double-writes the timeline. The caller sets `submitting`
    // before it awaits, so from the second click onwards the control must be inert.
    const { props, rerender } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Confirm move" }));
    rerender(<StageMoveDialog {...props} submitting />);

    const confirm = screen.getByRole("button", { name: "Moving…" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.click(confirm);

    expect(props.onConfirm).toHaveBeenCalledOnce();
  });

  it("freezes the reason and blocks every exit while the move is in flight", () => {
    // Cancelling or dismissing mid-write leaves the user with a closed dialog and no idea
    // whether the move landed — the write is already on its way to the server.
    const { props } = renderDialog({ submitting: true });

    expect(screen.getByLabelText("Reason").hasAttribute("disabled")).toBe(true);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel.hasAttribute("disabled")).toBe(true);

    fireEvent.click(cancel);
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });

    expect(props.onCancel).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm stage change")).toBeTruthy();
  });

  it("will not confirm without a reason, because the reason is the point of the dialog", () => {
    // won/lost are the two irreversible stage moves, and this dialog exists so the
    // timeline records why. Whitespace is not a reason.
    renderDialog({ reason: "   " });

    expect(screen.getByRole("button", { name: "Confirm move" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("lets the user out when no write is in flight", () => {
    const { props } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onCancel).toHaveBeenCalled();
  });
});
