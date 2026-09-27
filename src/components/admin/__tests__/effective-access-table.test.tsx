// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { EffectiveAccessTable } from "../effective-access-table";

afterEach(cleanup);

it("shows scoped access as conditional and displays override expiry", () => {
  render(
    <EffectiveAccessTable
      roleDefaults={[{ capability: "tasks.update", allowed: false }]}
      overrides={[
        {
          id: "override-1",
          profileId: "person-250",
          capability: "tasks.update",
          effect: "allow",
          departmentId: "department-1",
          teamId: null,
          resourceType: null,
          resourceId: null,
          expiresAt: "2030-03-20T00:00:00.000Z",
          revokedAt: null,
          reason: "Temporary coverage",
          grantedBy: "admin-1",
          createdAt: "2026-09-27T00:00:00.000Z",
        },
      ]}
    />,
  );
  const row = screen.getByText("tasks.update").closest("tr");
  expect(row?.textContent).toContain("Varies by scope");
  expect(row?.textContent).toContain("Department department-1");
  expect(row?.textContent).toContain("2030-03-20");
});
