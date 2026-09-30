// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { JobSheet } from "@/lib/types";
import { HandoffHeaderForm } from "../handoff-header-form";
vi.mock("@/components/people/profile-search-combobox", () => ({
  ProfileSearchCombobox: () => <input aria-label="Accounting owner search" role="combobox" />,
}));
afterEach(cleanup);
it.each([
  { status: "accepted", locked_at: null, expected: true },
  { status: "accounting_review", locked_at: "2026-09-30T00:00:00Z", expected: true },
  { status: "accounting_review", locked_at: null, expected: false },
])("enforces owner picker lock for $status / $locked_at", ({ status, locked_at, expected }) => {
  const jobSheet = { id: "sheet-1", status, locked_at } as JobSheet;
  render(<HandoffHeaderForm jobSheet={jobSheet} editable onSave={vi.fn()} />);
  expect(
    screen.getByRole("combobox", { name: "Accounting owner search" }).matches(":disabled"),
  ).toBe(expected);
});
