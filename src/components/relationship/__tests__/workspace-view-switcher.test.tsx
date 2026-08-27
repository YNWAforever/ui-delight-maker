// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkspaceViewConfig } from "@/lib/types";

const { savePersonalWorkspaceViewMock } = vi.hoisted(() => ({
  savePersonalWorkspaceViewMock: vi.fn(),
}));

vi.mock("@/server-functions/workspace-preferences", () => ({
  savePersonalWorkspaceView: savePersonalWorkspaceViewMock,
}));

import { WorkspaceViewSwitcher } from "../workspace-view-switcher";

afterEach(() => {
  cleanup();
  // Call counts are asserted below, so they must not carry across cases.
  savePersonalWorkspaceViewMock.mockReset();
});

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

  it("saves one view however many times Enter is pressed", async () => {
    /*
      The submit button carries `disabled={saving}`, but Enter in the name field calls the
      save directly and never consulted it. Two writes create two identically named saved
      views, and the host route toasts "Saved the view …" for each — the second one over
      work the reader never asked for.
    */
    let settle!: (value: unknown) => void;
    savePersonalWorkspaceViewMock.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const config: WorkspaceViewConfig = {
      filters: {},
      columns: ["name"],
      sort: { field: "name", direction: "asc" },
    };
    const onSaved = vi.fn();
    render(
      <WorkspaceViewSwitcher
        objectType="account"
        activeConfig={config}
        views={[]}
        onSaved={onSaved}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save view" }));
    const field = screen.getByLabelText("View name");
    await userEvent.type(field, "Key accounts");
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(savePersonalWorkspaceViewMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle({ id: "view-2" });
    });
    // And the host is told once, so it refreshes and confirms once.
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
