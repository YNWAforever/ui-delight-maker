import type { AppSession } from "@/lib/auth/neon-auth.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("@/server/db/neon.server", () => ({ query: mockQuery }));

const context = {
  session: { profile: { id: "actor-1" } } as AppSession,
  actor: {
    profileId: "actor-1",
    role: "sales",
    status: "active",
    managedDepartmentIds: [],
    managedTeamIds: [],
    directReportIds: [],
  },
  overrides: [],
  now: new Date("2026-09-27T04:00:00.000Z"),
} satisfies RequestAuthorization;

describe("workspace search repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns bounded Company results", async () => {
    mockQuery.mockResolvedValue([
      {
        id: "a1",
        type: "Company",
        title: "Acme",
        subtitle: "Client",
        href: "/accounts/a1",
        matched_on: "name",
        type_order: 1,
      },
    ]);
    const { searchWorkspace } = await import("../workspace-search");

    await expect(searchWorkspace("Acme", 20, context)).resolves.toEqual([
      {
        id: "a1",
        type: "Company",
        title: "Acme",
        subtitle: "Client",
        href: "/accounts/a1",
        matchedOn: "name",
      },
    ]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("from accounts"),
      expect.arrayContaining(["%Acme%", 20]),
    );
  });

  it("clamps result limits to twenty", async () => {
    mockQuery.mockResolvedValue([]);
    const { searchWorkspace } = await import("../workspace-search");

    await searchWorkspace("Acme", 200, context);

    expect(mockQuery.mock.calls[0][1].slice(0, 2)).toEqual(["%Acme%", 20]);
  });
});
