// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrganizationDirectory as OrganizationDirectoryData } from "@/server/repositories/admin-teams";
import { OrganizationDirectory } from "../organization-directory";

const data: OrganizationDirectoryData = {
  departments: [
    {
      id: "dept-1",
      name: "Sales",
      description: "Revenue team",
      headProfileId: "profile-1",
      deputyProfileId: null,
      status: "active",
      createdBy: "admin-1",
      updatedBy: "admin-1",
      createdAt: "",
      updatedAt: "",
    },
  ],
  teams: [
    {
      id: "team-1",
      name: "Growth",
      purpose: "Pipeline ownership",
      leadProfileId: "profile-1",
      deputyProfileId: null,
      defaultOwnerProfileId: "profile-1",
      status: "active",
      createdBy: "admin-1",
      updatedBy: "admin-1",
      createdAt: "",
      updatedAt: "",
    },
  ],
  memberships: [],
};

const search = {
  kind: "department" as const,
  tab: "overview" as const,
  q: undefined,
  status: "active" as const,
  unit: undefined,
};

afterEach(() => cleanup());

describe("OrganizationDirectory", () => {
  it("separates departments and working teams and selects a unit", () => {
    const onSelectUnit = vi.fn();
    render(
      <OrganizationDirectory
        data={data}
        search={search}
        selectedUnitId={undefined}
        onSearchChange={vi.fn()}
        onSelectUnit={onSelectUnit}
        onCreate={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Departments" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Working teams" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sales/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Growth/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Growth/ }));
    expect(onSelectUnit).toHaveBeenCalledWith({ kind: "team", id: "team-1" });
  });

  it("keeps create and empty states explicit", () => {
    const onCreate = vi.fn();
    render(
      <OrganizationDirectory
        data={{ departments: [], teams: [], memberships: [] }}
        search={{ ...search, kind: "team" }}
        selectedUnitId={undefined}
        onSearchChange={vi.fn()}
        onSelectUnit={vi.fn()}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create organization unit" }));
    expect(onCreate).toHaveBeenCalledWith("team");
    expect(screen.getByText("No working teams match these filters.")).toBeTruthy();
  });
});
