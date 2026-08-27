// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import type { AdminAuditLog, Paginated } from "@/server/repositories/admin-access";
import { AdminAuditTable } from "../admin-audit-table";

const entry: AdminAuditLog = {
  id: "audit-1",
  actor_profile_id: "profile-1",
  target_type: "profile",
  target_id: "profile-2",
  action: "profile.role_changed",
  severity: "critical",
  reason: "Promotion approved by the head of sales",
  before_snapshot: { role: "sales" },
  after_snapshot: { role: "manager" },
  created_at: "2026-07-18T09:30:00.000Z",
};

const data: Paginated<AdminAuditLog> = { items: [entry], total: 120, page: 1, limit: 50 };

afterEach(() => cleanup());

describe("AdminAuditTable", () => {
  it("formats timestamps through the shared formatter", () => {
    render(<AdminAuditTable data={data} />);

    // This one column printed `entry.created_at` verbatim — the raw Postgres string — on the
    // one screen where timestamps are the point, while every sibling admin component already
    // used the SSR-safe formatter that `CLAUDE.md` requires.
    expect(screen.queryByText("2026-07-18T09:30:00.000Z")).toBeNull();
    expect(screen.getAllByText(/18 Jul 2026, 09:30/).length).toBeGreaterThan(0);
  });

  it("renders severity as a labelled badge rather than a bare word", () => {
    render(<AdminAuditTable data={data} />);
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
  });

  it("offers no export control when the caller does not supply one", () => {
    // `audit.export` is Super Admin and Admin only; the button used to render whenever the
    // prop existed, so an actor holding only an `audit.view` override got a live control
    // that always failed.
    render(<AdminAuditTable data={data} />);
    expect(screen.queryByRole("button", { name: /Export/ })).toBeNull();
  });

  it("states what the export actually contains, next to the control", () => {
    render(
      <AdminAuditTable
        data={data}
        onExport={vi.fn()}
        exportLabel="Export this page (CSV)"
        exportHint="Downloads the 1 entry listed below, with these filters applied. The full history is not exported."
      />,
    );

    // The export re-runs the same paginated read, so it is this page — not the history the
    // old file name `fimmick-admin-audit.json` claimed.
    expect(screen.getByRole("button", { name: /Export this page \(CSV\)/ })).toBeTruthy();
    expect(screen.getByText(/The full history is not exported/)).toBeTruthy();
  });

  it("cannot fire a second export while one is in flight", () => {
    const onExport = vi.fn();
    render(<AdminAuditTable data={data} onExport={onExport} exporting />);

    const button = screen.getByRole("button", { name: /Preparing/ });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(onExport).not.toHaveBeenCalled();
  });

  it("does not offer an export of nothing", () => {
    render(
      <AdminAuditTable
        data={{ items: [], total: 0, page: 1, limit: 50 }}
        onExport={vi.fn()}
        exportLabel="Export this page (CSV)"
      />,
    );

    expect(screen.getByRole("button", { name: /Export this page \(CSV\)/ })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText("No audit entries match these filters")).toBeTruthy();
  });
});
