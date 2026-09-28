// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamMemberTable } from "../team-member-table";

const users = [
  { id: "profile-1", name: "Ada Wong", email: "ada@example.com", status: "active" as const },
  { id: "profile-2", name: "Bea Chan", email: "bea@example.com", status: "active" as const },
];

const members = [
  {
    id: "membership-1",
    teamId: "team-1",
    profileId: "profile-1",
    name: "Ada Wong",
    email: "ada@example.com",
    status: "active" as const,
    membershipRole: "lead" as const,
    startsAt: null,
    endsAt: null,
    createdBy: null,
    createdAt: "",
    updatedAt: "",
    profileStatus: "active" as const,
  },
];

function renderWithQueries(content: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{content}</QueryClientProvider>);
}

afterEach(() => cleanup());

describe("TeamMemberTable", () => {
  it("supports bulk member selection and inline role changes", () => {
    const onAddMembers = vi.fn();
    const onUpdateMember = vi.fn();
    renderWithQueries(
      <TeamMemberTable
        members={members}
        availableMembers={users.filter((user) => user.id !== "profile-1")}
        canManage
        onAddMembers={onAddMembers}
        onUpdateMember={onUpdateMember}
        onEndMember={vi.fn()}
      />,
    );

    const listbox = screen.getByRole("listbox", { name: "Add members" });
    const option = screen.getByRole("option", { name: /Bea Chan/ }) as HTMLOptionElement;
    option.selected = true;
    fireEvent.change(listbox);
    fireEvent.click(screen.getByRole("button", { name: "Add selected members" }));
    expect(onAddMembers).toHaveBeenCalledWith(["profile-2"], null, null);

    fireEvent.change(screen.getByRole("combobox", { name: "Role for Ada Wong" }), {
      target: { value: "deputy" },
    });
    expect(onUpdateMember).toHaveBeenCalledWith(members[0], "deputy");
  });

  it("keeps the selection when the add is refused", async () => {
    // The form used to clear the instant the button was pressed, which reads as
    // confirmation. Combined with the missing catch, a refused add wiped the selection with
    // no message and no way to recover what had been chosen.
    const onAddMembers = vi.fn().mockRejectedValue(new Error("Team management is outside scope"));
    renderWithQueries(
      <TeamMemberTable
        members={members}
        availableMembers={users.filter((user) => user.id !== "profile-1")}
        canManage
        onAddMembers={onAddMembers}
        onUpdateMember={vi.fn()}
        onEndMember={vi.fn()}
      />,
    );

    const listbox = screen.getByRole("listbox", { name: "Add members" }) as HTMLSelectElement;
    const option = screen.getByRole("option", { name: /Bea Chan/ }) as HTMLOptionElement;
    option.selected = true;
    fireEvent.change(listbox);
    fireEvent.click(screen.getByRole("button", { name: "Add selected members" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("kept"));
    expect(Array.from(listbox.selectedOptions).map((entry) => entry.value)).toEqual(["profile-2"]);
  });

  it("puts ending a membership behind a confirmation that states the consequence", async () => {
    const onEndMember = vi.fn().mockResolvedValue(undefined);
    const actor = userEvent.setup();
    renderWithQueries(
      <TeamMemberTable
        members={members}
        availableMembers={[]}
        canManage
        onAddMembers={vi.fn()}
        onUpdateMember={vi.fn()}
        onEndMember={onEndMember}
      />,
    );

    await actor.click(screen.getByRole("button", { name: "End membership" }));
    // `endAdminTeamMembershipFn` stamps a fresh `endedAt` per call and writes an audit row,
    // so a stray click is neither idempotent nor invisible.
    expect(onEndMember).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("audit log");
    expect(dialog.textContent).toContain("can be added back");

    // Confirming runs the handler; the row button and the dialog action share a label, and
    // the dialog's is the last one in the document.
    const confirmButtons = screen.getAllByRole("button", { name: "End membership" });
    await actor.click(confirmButtons[confirmButtons.length - 1]);
    expect(onEndMember).toHaveBeenCalledWith(members[0]);
  });

  it("does not offer a write control to a role that cannot manage the team", () => {
    renderWithQueries(
      <TeamMemberTable
        members={members}
        availableMembers={users}
        canManage={false}
        onAddMembers={vi.fn()}
        onUpdateMember={vi.fn()}
        onEndMember={vi.fn()}
      />,
    );

    expect(screen.queryByRole("listbox", { name: "Add members" })).toBeNull();
    expect(screen.queryByRole("button", { name: "End membership" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /Role for/ })).toBeNull();
  });

  it("keeps only failed member IDs after a partial bulk result", async () => {
    const onAddMembers = vi.fn().mockResolvedValue(false);
    renderWithQueries(
      <TeamMemberTable
        members={members}
        availableMembers={users.filter((user) => user.id !== "profile-1")}
        canManage
        bulkResult={{
          operationId: "operation-1",
          state: "completed",
          processed: 2,
          total: 2,
          remainingIds: ["profile-2"],
          results: [
            { id: "profile-1", status: "succeeded", retryable: false },
            { id: "profile-2", status: "forbidden", retryable: false },
          ],
        }}
        onAddMembers={onAddMembers}
        onUpdateMember={vi.fn()}
        onEndMember={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        Array.from(
          (screen.getByRole("listbox", { name: "Add members" }) as HTMLSelectElement)
            .selectedOptions,
          (option) => option.value,
        ),
      ).toEqual(["profile-2"]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add selected members" }));
    await waitFor(() => expect(onAddMembers).toHaveBeenCalledWith(["profile-2"], null, null));
  });

  it("rejects a temporary membership whose end is not after its start", () => {
    const onAddMembers = vi.fn();
    renderWithQueries(
      <TeamMemberTable
        members={members}
        availableMembers={users.filter((user) => user.id !== "profile-1")}
        canManage
        onAddMembers={onAddMembers}
        onUpdateMember={vi.fn()}
        onEndMember={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Membership start"), {
      target: { value: "2026-08-10" },
    });
    fireEvent.change(screen.getByLabelText("Membership end"), {
      target: { value: "2026-08-09" },
    });
    const listbox = screen.getByRole("listbox", { name: "Add members" });
    const option = screen.getByRole("option", { name: /Bea Chan/ }) as HTMLOptionElement;
    option.selected = true;
    fireEvent.change(listbox);
    fireEvent.click(screen.getByRole("button", { name: "Add selected members" }));

    expect(onAddMembers).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "Membership end must be after its start.",
    );
  });
});
