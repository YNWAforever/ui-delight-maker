// @vitest-environment jsdom

import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { InviteUsersDialog } from "../invite-users-dialog";

function render(content: React.ReactNode) {
  return rtlRender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {content}
    </QueryClientProvider>,
  );
}

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
  it("moves focus inside on open and closes with Escape without sending", async () => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn();
    render(<InviteUsersDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("returns focus to the invite trigger after Escape", async () => {
    const onSubmit = vi.fn();
    function InviteHarness() {
      const [open, setOpen] = useState(false);
      const triggerRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
            Invite users
          </button>
          <InviteUsersDialog
            open={open}
            onOpenChange={setOpen}
            onSubmit={onSubmit}
            triggerRef={triggerRef}
          />
        </>
      );
    }
    render(<InviteHarness />);
    const trigger = screen.getByRole("button", { name: "Invite users" });
    await userEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Email addresses" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("keeps the dialog open while an invitation is submitting", async () => {
    let finish!: () => void;
    const onSubmit = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const onOpenChange = vi.fn();
    render(<InviteUsersDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Email addresses" }),
      "person@example.com",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send invitations" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("button", { name: "Close invitation dialog" }).hasAttribute("disabled"),
    ).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("dialog")).toBeTruthy();
    finish();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send invitations" })).toBeTruthy(),
    );
  });
});
