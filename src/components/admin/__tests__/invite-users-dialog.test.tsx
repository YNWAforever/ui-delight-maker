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
  it("shows a copyable activation link for every invitation that was not emailed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const onSubmit = vi.fn().mockResolvedValue([
      {
        invitation: { email: "ada@example.com", expires_at: "2026-10-11T02:00:00Z" },
        inviteUrl: "https://clientops.example/invite/raw-token-1",
        delivery: { delivered: false, reason: "missing_webhook" },
      },
      {
        invitation: { email: "bob@example.com", expires_at: "2026-10-11T02:00:00Z" },
        inviteUrl: "https://clientops.example/invite/raw-token-2",
        delivery: { delivered: true },
      },
    ]);
    render(<InviteUsersDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.type(
      screen.getByRole("textbox", { name: "Email addresses" }),
      "ada@example.com, bob@example.com",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send invitations" }));

    const link = await screen.findByRole("textbox", { name: "ada@example.com" });
    expect((link as HTMLInputElement).value).toBe("https://clientops.example/invite/raw-token-1");
    expect((link as HTMLInputElement).readOnly).toBe(true);
    // The emailed invitee needs no link on screen.
    expect(screen.queryByRole("textbox", { name: "bob@example.com" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "Copy activation link for ada@example.com" }),
    );
    expect(writeText).toHaveBeenCalledWith("https://clientops.example/invite/raw-token-1");
    expect(await screen.findByText("Link copied. Send it to the person directly.")).toBeTruthy();
  });

  it("selects the link when the clipboard is blocked", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const onSubmit = vi.fn().mockResolvedValue([
      {
        invitation: { email: "ada@example.com", expires_at: "2026-10-11T02:00:00Z" },
        inviteUrl: "https://clientops.example/invite/raw-token-1",
        delivery: { delivered: false, reason: "missing_webhook" },
      },
    ]);
    render(<InviteUsersDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Email addresses" }),
      "ada@example.com",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send invitations" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Copy activation link for ada@example.com" }),
    );

    expect(await screen.findByText(/Copying is blocked in this browser/)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "ada@example.com" }));
  });

  it("offers only the roles the inviter may grant", () => {
    // The server refuses a manager anything but operational roles and anyone but a Super Admin
    // a Super Admin; listing them anyway offered choices that could only fail (UX-07).
    const optionsFor = (actorRole: "manager" | "admin" | "super_admin") => {
      const { unmount } = render(
        <InviteUsersDialog open onOpenChange={vi.fn()} onSubmit={vi.fn()} actorRole={actorRole} />,
      );
      const values = Array.from(
        (screen.getByRole("combobox", { name: "Invitation role" }) as HTMLSelectElement).options,
      ).map((option) => option.value);
      unmount();
      return values;
    };

    expect(optionsFor("manager")).toEqual(["sales", "client_success", "accounting", "read_only"]);
    expect(optionsFor("admin")).not.toContain("super_admin");
    expect(optionsFor("admin")).toContain("admin");
    expect(optionsFor("super_admin")).toContain("super_admin");
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
