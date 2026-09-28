// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceAccessState } from "../workspace-access-state";

afterEach(cleanup);

describe("workspace access guidance", () => {
  it("explains a signed-in identity without a profile without offering another login loop", () => {
    render(<WorkspaceAccessState state="no_profile" />);
    expect(screen.getByRole("heading", { name: /access pending/i })).toBeTruthy();
    expect(screen.getByText(/administrator invitation/i)).toBeTruthy();
    expect(screen.queryByText(/sign in to your workspace/i)).toBeNull();
  });

  it("names suspended and deactivated states without offering workspace controls", () => {
    const { rerender } = render(<WorkspaceAccessState state="suspended" />);
    expect(screen.getByRole("heading", { name: /suspended/i })).toBeTruthy();
    rerender(<WorkspaceAccessState state="deactivated" />);
    expect(screen.getByRole("heading", { name: /deactivated/i })).toBeTruthy();
  });

  it("guides an already invited identity to its existing invitation link", () => {
    render(<WorkspaceAccessState state="invited" />);
    expect(screen.getByText(/invitation link/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /resend/i })).toBeNull();
  });
});
