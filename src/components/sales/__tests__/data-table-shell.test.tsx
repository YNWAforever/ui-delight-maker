// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { DataTableShell, type ColumnDef } from "../data-table-shell";

type Quote = { id: string; name: string; owner: string; amount: string };

const quotes: Quote[] = [
  { id: "q-1", name: "ACME renewal", owner: "Dana", amount: "12,400" },
  { id: "q-2", name: "Northwind pilot", owner: "Sam", amount: "3,100" },
];

const columns: ColumnDef<Quote>[] = [
  { id: "name", header: "Quote", cell: (row) => row.name, priority: "primary", sticky: true },
  { id: "owner", header: "Owner", cell: (row) => row.owner, priority: "secondary" },
  {
    id: "amount",
    header: "Amount",
    cell: (row) => row.amount,
    priority: "tertiary",
    numeric: true,
  },
];

const rowKey = (row: Quote) => row.id;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DataTableShell", () => {
  it("drops columns by priority tier instead of letting the table scroll sideways", () => {
    // The tiers are the alternative to a scroll container: a table that can scroll never
    // has to admit it has too many columns, so the narrow viewport silently loses half of
    // every row. Both the header and the body cell must carry the same tier, or the
    // column header outlives its data.
    const { container } = render(
      <DataTableShell columns={columns} rows={quotes} rowKey={rowKey} />,
    );

    const header = (name: string) => screen.getByRole("columnheader", { name });

    expect(header("Quote").className).not.toContain("hidden");
    expect(header("Owner").className).toContain("hidden md:table-cell");
    expect(header("Amount").className).toContain("hidden lg:table-cell");

    const ownerCell = screen.getByText("Dana");
    const amountCell = screen.getByText("12,400");
    expect(ownerCell.className).toContain("hidden md:table-cell");
    expect(amountCell.className).toContain("hidden lg:table-cell");

    // Right-aligned because it is numeric; no `tabular-nums`, which `table` sets globally.
    expect(amountCell.className).toContain("text-right");
    expect(amountCell.className).not.toContain("tabular-nums");

    expect(container.querySelector(".overflow-x-auto")).toBeNull();
  });

  it("adds a horizontal scroll container only when explicitly allowed", () => {
    const { container } = render(
      <DataTableShell columns={columns} rows={quotes} rowKey={rowKey} allowHorizontalScroll />,
    );

    expect(container.querySelector(".overflow-x-auto")).not.toBeNull();
  });

  it("puts aria-sort on the sorted column header and asks for the next sort by column id", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DataTableShell
        columns={columns}
        rows={quotes}
        rowKey={rowKey}
        sort={{ columnId: "name", direction: "asc", onChange }}
      />,
    );

    // aria-sort belongs on the th, the control belongs inside it. Screen readers announce
    // the sort state from the cell, so putting it on the button would drop it entirely.
    expect(screen.getByRole("columnheader", { name: "Quote" }).getAttribute("aria-sort")).toBe(
      "ascending",
    );
    expect(screen.getByRole("columnheader", { name: "Owner" }).getAttribute("aria-sort")).toBe(
      "none",
    );

    await userEvent.click(screen.getByRole("button", { name: "Amount" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("amount");

    // Direction is the caller's state, not the component's, so the flip arrives as props.
    rerender(
      <DataTableShell
        columns={columns}
        rows={quotes}
        rowKey={rowKey}
        sort={{ columnId: "amount", direction: "desc", onChange }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Amount" }).getAttribute("aria-sort")).toBe(
      "descending",
    );
    expect(screen.getByRole("columnheader", { name: "Quote" }).getAttribute("aria-sort")).toBe(
      "none",
    );
  });

  it("leaves headers as plain text when no sort handler is given", () => {
    render(<DataTableShell columns={columns} rows={quotes} rowKey={rowKey} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(
      screen.getByRole("columnheader", { name: "Quote" }).getAttribute("aria-sort"),
    ).toBeNull();
  });

  it("renders no selection control at all unless a selection handler is supplied", () => {
    // A checkbox with no bulk action behind it promises something the page cannot do.
    const { rerender } = render(<DataTableShell columns={columns} rows={quotes} rowKey={rowKey} />);

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getAllByRole("columnheader")).toHaveLength(columns.length);

    rerender(
      <DataTableShell
        columns={columns}
        rows={quotes}
        rowKey={rowKey}
        selection={{ selected: new Set<string>(), onChange: vi.fn() }}
      />,
    );

    // One per row plus the select-all in the header.
    expect(screen.getAllByRole("checkbox")).toHaveLength(quotes.length + 1);
    expect(screen.getByRole("checkbox", { name: "Select all rows" })).toBeDefined();
    expect(screen.getAllByRole("columnheader")).toHaveLength(columns.length + 1);
  });

  it("adds and removes only the visible rows when select-all is toggled", async () => {
    const onChange = vi.fn();
    // A key from another page of results must survive select-all on this one.
    const selected = new Set<string>(["q-from-another-page"]);

    render(
      <DataTableShell
        columns={columns}
        rows={quotes}
        rowKey={rowKey}
        selection={{ selected, onChange }}
      />,
    );

    await userEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));

    expect(onChange).toHaveBeenCalledOnce();
    expect([...(onChange.mock.calls[0][0] as Set<string>)].sort()).toEqual([
      "q-1",
      "q-2",
      "q-from-another-page",
    ]);
  });

  it("makes the row reachable through a real anchor in the identity cell", () => {
    const { container } = render(
      <DataTableShell
        columns={columns}
        rows={quotes}
        rowKey={rowKey}
        rowHref={(row) => `/quotes/${row.id}`}
      />,
    );

    const link = screen.getByRole("link", { name: "ACME renewal" });
    expect(link.getAttribute("href")).toBe("/quotes/q-1");

    // The alternative — a click handler on the tr with tabIndex — announces the whole row
    // as one control and swallows every control inside it. There must be no such row.
    expect(container.querySelectorAll("tr[tabindex]")).toHaveLength(0);
    expect(container.querySelectorAll("tr[role]")).toHaveLength(0);
    // Exactly one anchor per row: the identity cell, not every cell.
    expect(screen.getAllByRole("link")).toHaveLength(quotes.length);
  });

  it("marks the row shown in the detail panel without hiding it from the reader", () => {
    render(
      <DataTableShell
        columns={columns}
        rows={quotes}
        rowKey={rowKey}
        rowHref={(row) => `/quotes/${row.id}`}
        selectedRowKey="q-2"
      />,
    );

    // Selection is a background tint, which is colour alone; aria-current carries it too.
    expect(screen.getByRole("link", { name: "Northwind pilot" }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(
      screen.getByRole("link", { name: "ACME renewal" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("names the table for screen readers with a visually hidden caption", () => {
    const { container } = render(
      <DataTableShell columns={columns} rows={quotes} rowKey={rowKey} caption="Open quotes" />,
    );

    const caption = container.querySelector("caption");
    expect(caption?.textContent).toBe("Open quotes");
    expect(caption?.className).toContain("sr-only");
  });

  it("keeps row details collapsed until asked, and reports the state in the button", async () => {
    render(
      <DataTableShell
        columns={columns}
        rows={quotes}
        rowKey={rowKey}
        expandable={{ renderDetails: (row) => <p>Line items for {row.name}</p> }}
      />,
    );

    const toggle = screen.getByRole("button", { name: "Show details for q-1" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Line items for ACME renewal")).toBeNull();

    await userEvent.click(toggle);

    expect(screen.getByText("Line items for ACME renewal")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Hide details for q-1" }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("puts row actions behind one named overflow menu rather than loose icon buttons", () => {
    render(
      <DataTableShell
        columns={columns}
        rows={quotes}
        rowKey={rowKey}
        rowActions={() => <button type="button">Duplicate</button>}
      />,
    );

    const triggers = screen.getAllByRole("button", { name: /Actions for row/ });
    expect(triggers).toHaveLength(quotes.length);
    // Closed menu: the items are not in the document until the trigger is opened.
    expect(screen.queryByText("Duplicate")).toBeNull();
    expect(triggers[0].getAttribute("aria-expanded")).toBe("false");
  });
});
