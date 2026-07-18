// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InviteUsersDialog } from "../invite-users-dialog";

afterEach(cleanup);

describe("InviteUsersDialog", () => {
  it("normalizes unique emails and submits a seven-day invitation batch", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<InviteUsersDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Email addresses" }), {
      target: { value: " ADA@Example.com\nada@example.com, bob@example.com " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitations" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({
          email: "ada@example.com",
          role: "sales",
          initialTeamIds: [],
        }),
        expect.objectContaining({
          email: "bob@example.com",
          role: "sales",
          initialTeamIds: [],
        }),
      ]),
    );
  });

  it("shows validation feedback and does not submit malformed addresses", () => {
    const onSubmit = vi.fn();
    render(<InviteUsersDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Email addresses" }), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitations" }));

    expect(screen.getByText("Enter at least one valid email address.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
