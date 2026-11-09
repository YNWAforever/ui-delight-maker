// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessState } from "../workspace-access-state";

afterEach(cleanup);

describe("workspace access guidance", () => {
  it("explains a signed-in identity without a profile without offering another login loop", () => {
    render(<WorkspaceAccessState state="no_profile" />);
    expect(screen.getByRole("heading", { name: /access pending/i })).toBeTruthy();
    expect(screen.getByText(/administrator invitation/i)).toBeTruthy();
    expect(screen.queryByText(/sign in to your workspace/i)).toBeNull();
  });

  it("tells an unverified identity how to verify and offers another account", () => {
    const onSignOut = vi.fn();
    render(<WorkspaceAccessState state="unverified" onSignOut={onSignOut} />);

    expect(screen.getByRole("heading", { name: /verify your email/i })).toBeTruthy();
    expect(screen.getByText(/neon auth sent/i)).toBeTruthy();
    expect(screen.getByText(/spam folder/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /different account/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
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
