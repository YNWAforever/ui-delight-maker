// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkspaceViewConfig } from "@/lib/types";

const { savePersonalWorkspaceViewMock } = vi.hoisted(() => ({
  savePersonalWorkspaceViewMock: vi.fn(),
}));

vi.mock("@/server-functions/workspace-preferences", () => ({
  savePersonalWorkspaceView: savePersonalWorkspaceViewMock,
}));

import { WorkspaceViewSwitcher } from "../workspace-view-switcher";

afterEach(() => cleanup());

describe("WorkspaceViewSwitcher", () => {
  it("saves a personal Account view", async () => {
    savePersonalWorkspaceViewMock.mockResolvedValue({ id: "view-1" });
    const config: WorkspaceViewConfig = {
      filters: { lifecycle_stage: "at_risk" },
      columns: ["name", "relationship_health"],
      sort: { field: "last_activity_at", direction: "desc" },
    };
    render(<WorkspaceViewSwitcher objectType="account" activeConfig={config} views={[]} />);

    await userEvent.click(screen.getByRole("button", { name: "Save view" }));
    await userEvent.type(screen.getByLabelText("View name"), "At-risk accounts");
    await userEvent.click(screen.getByRole("button", { name: "Save personal view" }));

    expect(savePersonalWorkspaceViewMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "At-risk accounts", objectType: "account" }),
    });
  });
});
