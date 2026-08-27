// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { ResponsiveRecordList } from "../responsive-record-list";
import type { ColumnDef } from "../data-table-shell";

type Account = { id: string; name: string; owner: string };

const accounts: Account[] = [
  { id: "a-1", name: "ACME", owner: "Dana" },
  { id: "a-2", name: "Northwind", owner: "Sam" },
];

const columns: ColumnDef<Account>[] = [
  { id: "name", header: "Account", cell: (row) => row.name, priority: "primary" },
  { id: "owner", header: "Owner", cell: (row) => row.owner, priority: "secondary" },
];

const rowKey = (row: Account) => row.id;
const rowHref = (row: Account) => `/accounts/${row.id}`;

/** The text a sighted user reads: everything in the element except its sr-only spans. */
const visibleTextOf = (element: HTMLElement) =>
  Array.from(element.childNodes)
    .filter((node) => !(node instanceof HTMLElement && node.classList.contains("sr-only")))
    .map((node) => node.textContent ?? "")
    .join("")
    .trim();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ResponsiveRecordList", () => {
  it("renders the same row identity and destination in both the table and the card", () => {
    render(
      <ResponsiveRecordList
        columns={columns}
        rows={accounts}
        rowKey={rowKey}
        rowHref={rowHref}
        renderCard={(row) => <span>{row.name}</span>}
      />,
    );

    // Both surfaces are in the DOM at once; CSS decides which one is shown. If they ever
    // disagreed about identity or destination, a phone would open a different record than
    // the desktop table said it would.
    const links = screen.getAllByRole("link", { name: "ACME" });
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/accounts/a-1",
      "/accounts/a-1",
    ]);
  });

  it("switches surfaces with responsive classes, never a measured width", () => {
    // A width check has no answer on the server, so SSR would emit one shape and hydration
    // would swap it for the other on first paint. The classes are the whole mechanism.
    const { container } = render(
      <ResponsiveRecordList
        columns={columns}
        rows={accounts}
        rowKey={rowKey}
        renderCard={(row) => <span>{row.name}</span>}
      />,
    );

    const table = container.querySelector("table");
    expect(table?.parentElement?.className).toBe("hidden md:block");
    expect(container.querySelector("ul")?.className).toContain("md:hidden");
  });

  it("honours a lg breakpoint when the table needs more room", () => {
    const { container } = render(
      <ResponsiveRecordList
        columns={columns}
        rows={accounts}
        rowKey={rowKey}
        breakpoint="lg"
        renderCard={(row) => <span>{row.name}</span>}
      />,
    );

    expect(container.querySelector("table")?.parentElement?.className).toBe("hidden lg:block");
    expect(container.querySelector("ul")?.className).toContain("lg:hidden");
  });

  it("carries the same row actions onto the card", () => {
    render(
      <ResponsiveRecordList
        columns={columns}
        rows={accounts}
        rowKey={rowKey}
        rowActions={() => <button type="button">Archive</button>}
        renderCard={(row) => <span>{row.name}</span>}
      />,
    );

    // One trigger in the table row, one on the card. A narrow viewport that cannot run a
    // record's actions is a read-only downgrade, not a responsive layout.
    expect(screen.getAllByRole("button", { name: "Actions for row a-1" })).toHaveLength(2);
  });

  it("keeps the row key out of the card's visible label but inside its accessible name", async () => {
    // The key is an opaque database id. It has to be in the accessible name, because two
    // cards' toggles are otherwise indistinguishable to a screen reader — but showing it
    // on screen turns a button into "Show details for a-1". The table's toggle carries the
    // identical accessible name, so the two surfaces announce the same thing.
    const { container } = render(
      <ResponsiveRecordList
        columns={columns}
        rows={accounts}
        rowKey={rowKey}
        expandable={{ renderDetails: (row) => <p>Contacts at {row.name}</p> }}
        renderCard={(row) => <span>{row.name}</span>}
      />,
    );

    // Both surfaces carry a toggle for a-1, so the query has to say which one it means.
    const cards = within(container.querySelector("ul") as HTMLElement);
    const table = within(container.querySelector("table") as HTMLElement);

    const cardToggle = cards.getByRole("button", { name: /for a-1$/ });
    expect(cardToggle.textContent).toBe("Show details for a-1");
    expect(visibleTextOf(cardToggle)).toBe("Show details");

    // The table's toggle has no visible text at all — a 32px chevron in a cell — so its
    // whole name is sr-only. The card is a wide row that needs a readable label, which is
    // why only it splits the string. Both still announce the same thing.
    expect(visibleTextOf(table.getByRole("button", { name: /for a-1$/ }))).toBe("");

    expect(cardToggle.getAttribute("aria-expanded")).toBe("false");
    expect(cards.queryByText("Contacts at ACME")).toBeNull();

    await userEvent.click(cardToggle);

    expect(cards.getByText("Contacts at ACME")).toBeDefined();
    expect(cards.getByRole("button", { name: /for a-1$/ }).textContent).toBe(
      "Hide details for a-1",
    );
    expect(cardToggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("renders no selection control on the card either unless selection is asked for", () => {
    const { rerender } = render(
      <ResponsiveRecordList
        columns={columns}
        rows={accounts}
        rowKey={rowKey}
        renderCard={(row) => <span>{row.name}</span>}
      />,
    );

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    rerender(
      <ResponsiveRecordList
        columns={columns}
        rows={accounts}
        rowKey={rowKey}
        selection={{ selected: new Set<string>(), onChange: vi.fn() }}
        renderCard={(row) => <span>{row.name}</span>}
      />,
    );

    // Table: two rows plus select-all. Cards: two rows, with no select-all to attach one to.
    expect(screen.getAllByRole("checkbox", { name: "Select row a-1" })).toHaveLength(2);
    expect(screen.getAllByRole("checkbox", { name: "Select all rows" })).toHaveLength(1);
  });
});
