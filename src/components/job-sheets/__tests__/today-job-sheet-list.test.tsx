// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { formatCurrencyAmount } from "@/lib/format";
import type { JobSheetListItem } from "@/server/repositories/job-sheets";

import { TodayJobSheetList } from "../today-job-sheet-list";

afterEach(cleanup);

const sheet: JobSheetListItem = {
  id: "js-1",
  number: "JS-2026-0042",
  quote_id: "q-1",
  status: "accounting_review",
  locked_at: null,
  po_number: null,
  client_order_number: null,
  created_at: "2026-10-02T03:00:00Z",
  total_amount: 128500,
  currency: "HKD",
  has_xero_customer_reference: false,
  quote_number: "QT-1001",
  company_name: "香港拯救貓狗協會有限公司",
  accounting_owner: null,
};

describe("TodayJobSheetList", () => {
  it("gives accounting the client, accepted total and status to triage by", () => {
    // UX-15: each row was the sheet number and the raw key "accounting_review".
    render(<TodayJobSheetList jobSheets={[sheet]} />);

    const table = screen.getByRole("table", { name: "Job sheets waiting on accounting" });
    const row = within(table).getAllByRole("row")[1];
    expect(row.textContent).toContain("香港拯救貓狗協會有限公司");
    expect(row.textContent).toContain(formatCurrencyAmount(128500, "HKD"));
    expect(row.textContent).not.toContain("accounting_review");
    expect(within(table).getByRole("link", { name: "JS-2026-0042" }).getAttribute("href")).toBe(
      "/job-sheets/js-1",
    );
  });

  it("names a sheet with no linked client honestly", () => {
    render(<TodayJobSheetList jobSheets={[{ ...sheet, company_name: null }]} />);

    expect(screen.getAllByText("Not linked").length).toBeGreaterThan(0);
  });
});
