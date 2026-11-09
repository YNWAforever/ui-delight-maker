// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PermissionOverrideRecord } from "@/server/repositories/admin-access";

const clientNowState = vi.hoisted(() => ({ now: null as number | null }));

vi.mock("@/hooks/use-client-now", () => ({ useClientNow: () => clientNowState.now }));

import { EffectiveAccessTable, OverrideHistory } from "../effective-access-table";

afterEach(() => {
  cleanup();
  clientNowState.now = null;
});

const override = (overrides: Partial<PermissionOverrideRecord> = {}): PermissionOverrideRecord => ({
  id: "override-1",
  profileId: "person-250",
  capability: "tasks.update",
  effect: "allow",
  departmentId: null,
  teamId: null,
  resourceType: null,
  resourceId: null,
  expiresAt: null,
  revokedAt: null,
  reason: "Temporary coverage",
  grantedBy: "admin-1",
  createdAt: "2026-09-27T00:00:00.000Z",
  ...overrides,
});

it("shows scoped access as conditional and displays override expiry", () => {
  render(
    <EffectiveAccessTable
      roleDefaults={[{ capability: "tasks.update", allowed: false }]}
      overrides={[
        override({ departmentId: "department-1", expiresAt: "2030-03-20T00:00:00.000Z" }),
      ]}
    />,
  );
  const row = screen.getByText("tasks.update").closest("tr");
  expect(row?.textContent).toContain("Varies by scope");
  expect(row?.textContent).toContain("Department department-1");
  expect(row?.textContent).toContain("2030-03-20");
});

describe("OverrideHistory expiry", () => {
  it("does not guess an expiry before the client clock resolves, then splits it after mount", () => {
    // P3-6: expiry used to be `Date.parse(expiresAt) <= Date.now()` during render, so an
    // override that expired between the server render and hydration produced different
    // markup on each side. With no client clock the entry is "not expired yet" on both.
    const expired = override({ expiresAt: "2026-01-01T00:00:00.000Z" });

    clientNowState.now = null;
    const { rerender } = render(<OverrideHistory overrides={[expired]} />);
    expect(screen.getByText("No expired or revoked overrides.")).toBeTruthy();

    clientNowState.now = Date.parse("2026-02-01T00:00:00.000Z");
    rerender(<OverrideHistory overrides={[expired]} />);

    expect(screen.queryByText("No expired or revoked overrides.")).toBeNull();
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText("tasks.update")).toBeTruthy();
  });

  it("keeps a still-running override out of history once the clock resolves", () => {
    clientNowState.now = Date.parse("2026-02-01T00:00:00.000Z");
    render(<OverrideHistory overrides={[override({ expiresAt: "2026-03-01T00:00:00.000Z" })]} />);

    expect(screen.getByText("No expired or revoked overrides.")).toBeTruthy();
  });

  it("lists a revoked override before the clock resolves", () => {
    clientNowState.now = null;
    render(<OverrideHistory overrides={[override({ revokedAt: "2026-01-15T00:00:00.000Z" })]} />);

    expect(screen.getByText("Revoked")).toBeTruthy();
    expect(screen.queryByText("No expired or revoked overrides.")).toBeNull();
  });
});
