// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FilterToolbar, type FilterControl } from "../filter-toolbar";

afterEach(cleanup);

const filter = (id: string, label: string, value = "all"): FilterControl => ({
  id,
  label,
  value,
  options: [
    { value: "all", label: `All ${label.toLowerCase()}` },
    { value: "open", label: "Open" },
  ],
  onChange: vi.fn(),
});

describe("FilterToolbar", () => {
  it("keeps two filters inline and offers no sheet to open", () => {
    // A sheet that hides two dropdowns costs a tap and buys no room.
    render(
      <FilterToolbar filters={[filter("a", "Status"), filter("b", "Owner")]} onClear={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  it("collapses into a Filters sheet once there is a third filter", () => {
    // Three dropdowns plus a search box no longer fit a 375px row, so below md they move
    // behind one control instead of wrapping into a four-line toolbar.
    render(
      <FilterToolbar
        filters={[filter("a", "Status"), filter("b", "Owner"), filter("c", "Team")]}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
    // The inline row is still rendered — it is the desktop layout, hidden by CSS below md,
    // not a second copy of the filters conjured only for wide screens.
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
  });

  it("does not count sort as a filter when deciding to collapse", () => {
    // Sort answers "in what order", not "which rows". Letting it push the toolbar over the
    // threshold would hide two filters behind a sheet on a phone for no reason.
    render(
      <FilterToolbar
        filters={[filter("a", "Status"), filter("b", "Owner")]}
        sort={{
          value: "recent",
          options: [
            { value: "recent", label: "Most recent" },
            { value: "value", label: "Highest value" },
          ],
          onChange: vi.fn(),
        }}
        onClear={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
  });

  it("displays the value it is given rather than any value of its own", () => {
    // Filter state lives in the route's URL search params so a filtered view can be
    // shared and navigated back to. If this component held the value, the URL would go
    // stale the moment a user pressed back.
    const status = filter("a", "Status", "open");
    const { rerender } = render(<FilterToolbar filters={[status]} onClear={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: "Status" }).textContent).toContain("Open");

    rerender(<FilterToolbar filters={[{ ...status, value: "all" }]} onClear={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Status" }).textContent).toContain("All status");
  });

  it("hands search text straight back to the caller", () => {
    const onChange = vi.fn();
    render(
      <FilterToolbar
        search={{ value: "", onChange }}
        filters={[filter("a", "Status")]}
        onClear={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "acme" },
    });
    expect(onChange).toHaveBeenCalledWith("acme");
  });

  it("announces the result count in a live region", () => {
    // "Your filter matched nothing" must be spoken, not just shown. Silence reads as a
    // page that failed to load.
    render(<FilterToolbar filters={[filter("a", "Status")]} onClear={vi.fn()} resultCount={0} />);

    expect(screen.getByRole("status").textContent).toBe("0 results");
  });

  it("pluralises the result count", () => {
    render(<FilterToolbar filters={[filter("a", "Status")]} onClear={vi.fn()} resultCount={1} />);

    expect(screen.getByRole("status").textContent).toBe("1 result");
  });

  it("delegates clearing rather than resetting anything itself", () => {
    const onClear = vi.fn();
    render(<FilterToolbar filters={[filter("a", "Status", "open")]} onClear={onClear} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onClear).toHaveBeenCalledOnce();
    // The route owns the reset, so nothing changes here until it says so.
    expect(screen.getByRole("combobox", { name: "Status" }).textContent).toContain("Open");
  });
});
