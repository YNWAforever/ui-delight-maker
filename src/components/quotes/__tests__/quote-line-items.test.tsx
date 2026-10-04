// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { formatCurrencyAmount } from "@/lib/format";

import { QuoteLineItemsView } from "../quote-line-items";

afterEach(cleanup);

const items = [
  {
    id: "li-1",
    service: "香港拯救貓狗協會 annual gala livestream",
    description: "",
    qty: 3,
    unit_price: 12500,
  },
  { id: "li-2", service: "Edit suite", description: "Two days", qty: 1, unit_price: 66.84 },
];

describe("QuoteLineItemsView", () => {
  it("keeps quantity, unit price, line total and the quote total on a phone", () => {
    // UX-13: below md the table kept only "Service"; every money column was hidden.
    render(<QuoteLineItemsView items={items} currency="HKD" total={37566.84} />);

    const list = screen.getByRole("list", { name: "Line items" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first.textContent).toContain(`3 × ${formatCurrencyAmount(12500, "HKD")}`);
    expect(first.textContent).toContain(formatCurrencyAmount(37500, "HKD"));
    expect(second.textContent).toContain("Two days");
    // The phone total sits outside the list, always visible beneath it.
    expect(list.parentElement?.className).toContain("md:hidden");
    expect(list.parentElement?.textContent).toContain(formatCurrencyAmount(37566.84, "HKD"));
  });

  it("is a table with named columns and a row-headed total from md", () => {
    render(<QuoteLineItemsView items={items} currency="HKD" total={37566.84} />);

    const table = screen.getByRole("table");
    expect(table.parentElement?.className).toContain("md:block");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Service", "Qty", "Unit price", "Total"]);
    expect(within(table).getByRole("rowheader", { name: "Total" })).toBeTruthy();
    // Money never wraps mid-amount.
    for (const cell of within(table).getAllByText(/^HKD/)) {
      expect(cell.className).toContain("whitespace-nowrap");
    }
  });

  it("shows no empty description line", () => {
    render(<QuoteLineItemsView items={[items[0]]} currency="HKD" total={37500} />);

    const [item] = within(screen.getByRole("list", { name: "Line items" })).getAllByRole(
      "listitem",
    );
    expect(item.querySelectorAll("p")).toHaveLength(1);
  });
});
