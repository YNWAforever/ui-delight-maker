// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompanyWorkspaceSectionState } from "../company-workspace-section-state";

afterEach(() => cleanup());

describe("CompanyWorkspaceSectionState", () => {
  it("keeps a fixed loading surface while data is pending", () => {
    render(<CompanyWorkspaceSectionState isLoading emptyMessage="No activity." />);

    expect(screen.getByText("Loading company details…")).toBeTruthy();
    expect(
      screen.getByTestId("company-workspace-section-state").classList.contains("min-h-40"),
    ).toBe(true);
  });

  it("renders the empty message for an empty section", () => {
    render(
      <CompanyWorkspaceSectionState
        state={{ status: "empty", data: [] }}
        isLoading={false}
        emptyMessage="No activity."
      />,
    );

    expect(screen.getByText("No activity.")).toBeTruthy();
  });

  it("renders ready children with section data", () => {
    render(
      <CompanyWorkspaceSectionState
        state={{ status: "ready", data: { label: "Recent activity" } }}
        isLoading={false}
        emptyMessage="No activity."
      >
        {(data) => <span>{data.label}</span>}
      </CompanyWorkspaceSectionState>,
    );

    expect(screen.getByText("Recent activity")).toBeTruthy();
  });

  it("offers retry only for retryable safe errors", async () => {
    const retry = vi.fn();
    const { rerender } = render(
      <CompanyWorkspaceSectionState
        state={{
          status: "error",
          error: { code: "query_timeout", requestId: "request-1", retryable: true },
        }}
        isLoading={false}
        emptyMessage="No activity."
        onRetry={retry}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Retry section" }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(
      <CompanyWorkspaceSectionState
        state={{
          status: "error",
          error: { code: "schema_mismatch", requestId: "request-2", retryable: false },
        }}
        isLoading={false}
        emptyMessage="No activity."
      />,
    );

    expect(screen.queryByRole("button", { name: "Retry section" })).not.toBeTruthy();
    expect(screen.getByText("Company details are temporarily unavailable.")).toBeTruthy();
    expect(screen.getByText(/Reference request-2/)).toBeTruthy();
    expect(screen.queryByText(/schema_mismatch/)).not.toBeTruthy();
  });
});
