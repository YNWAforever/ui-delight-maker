// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

afterEach(() => cleanup());

describe("TeamMemberTable", () => {
  it("supports bulk member selection and inline role changes", () => {
    const onAddMembers = vi.fn();
    const onUpdateMember = vi.fn();
    render(
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

  it("rejects a temporary membership whose end is not after its start", () => {
    const onAddMembers = vi.fn();
    render(
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
