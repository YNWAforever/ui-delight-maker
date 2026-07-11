import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("@/server/db/neon.server", () => ({ query: mockQuery }));

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

    await expect(searchWorkspace("Acme", 20)).resolves.toEqual([
      {
        id: "a1",
        type: "Company",
        title: "Acme",
        subtitle: "Client",
        href: "/accounts/a1",
        matchedOn: "name",
      },
    ]);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("from accounts"), [
      "%Acme%",
      20,
    ]);
  });

  it("clamps result limits to twenty", async () => {
    mockQuery.mockResolvedValue([]);
    const { searchWorkspace } = await import("../workspace-search");

    await searchWorkspace("Acme", 200);

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["%Acme%", 20]);
  });
});
