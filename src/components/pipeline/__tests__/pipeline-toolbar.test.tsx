// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PipelineToolbar } from "../pipeline-toolbar";

afterEach(cleanup);

describe("PipelineToolbar", () => {
  it("leaves out the owner filter, and any apology for it, when there are no owners", () => {
    // UX-18: a permanently disabled select sat above "needs an assignable-owner list from the
    // server, which does not exist yet" on every visit to the Revenue Desk.
    render(<PipelineToolbar filters={{}} owners={[]} onFiltersChange={vi.fn()} />);

    expect(screen.queryByRole("combobox", { name: "Filter by owner" })).toBeNull();
    expect(screen.queryByText(/does not exist yet/)).toBeNull();
    expect(screen.getByRole("combobox", { name: "Filter by urgency" })).toBeTruthy();
  });

  it("offers the owner filter once the server supplies owners", () => {
    render(
      <PipelineToolbar
        filters={{}}
        owners={[{ id: "p-1", name: "陳大文" }]}
        onFiltersChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Filter by owner" })).toBeTruthy();
  });
});
