import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@/server/db/neon.server", () => ({ query: queryMock }));
vi.mock("@/legacy-supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

describe("batch ownership resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([]);
  });

  it("returns an entry for every requested id", async () => {
    const { resolveOwnerProfileIds } = await import("../resource-ownership");
    queryMock.mockResolvedValueOnce([{ id: "lead-1", owner_profile_id: "user-1" }]);

    const owners = await resolveOwnerProfileIds("lead", ["lead-1", "lead-2"]);

    // Total, not sparse: a caller must not have to distinguish "unowned" from "not asked".
    expect(owners.size).toBe(2);
    expect(owners.get("lead-1")).toBe("user-1");
    expect(owners.get("lead-2")).toBeNull();
  });

  it("deduplicates ids before querying", async () => {
    const { resolveOwnerProfileIds } = await import("../resource-ownership");
    queryMock.mockResolvedValueOnce([{ id: "lead-1", owner_profile_id: "user-1" }]);

    const owners = await resolveOwnerProfileIds("lead", ["lead-1", "lead-1", "lead-1"]);

    // A page of twenty runs about one lead must send one id, not twenty.
    expect(queryMock.mock.calls[0][1]).toEqual([["lead-1"]]);
    expect(owners.size).toBe(1);
  });

  it("issues no query for an empty id list", async () => {
    const { resolveOwnerProfileIds } = await import("../resource-ownership");

    const owners = await resolveOwnerProfileIds("lead", []);

    expect(queryMock).not.toHaveBeenCalled();
    expect(owners.size).toBe(0);
  });

  it("returns an empty map for a resource type it does not own", async () => {
    const { resolveOwnerProfileIds } = await import("../resource-ownership");

    const owners = await resolveOwnerProfileIds("workspace_view", ["x-1"]);

    // Mirrors resolveOwnerProfileId's existing contract: an unknown type is unowned, not an
    // error.
    expect(queryMock).not.toHaveBeenCalled();
    expect(owners.size).toBe(0);
  });

  it("maps a null owner column to null rather than dropping the entry", async () => {
    const { resolveOwnerProfileIds } = await import("../resource-ownership");
    queryMock.mockResolvedValueOnce([{ id: "lead-1", owner_profile_id: null }]);

    const owners = await resolveOwnerProfileIds("lead", ["lead-1"]);

    expect(owners.has("lead-1")).toBe(true);
    expect(owners.get("lead-1")).toBeNull();
  });

  it("resolves a single id through the batch path", async () => {
    const { resolveOwnerProfileId } = await import("../resource-ownership");
    queryMock.mockResolvedValueOnce([{ id: "lead-1", owner_profile_id: "user-1" }]);

    await expect(resolveOwnerProfileId("lead", "lead-1")).resolves.toBe("user-1");
    expect(queryMock.mock.calls[0][1]).toEqual([["lead-1"]]);
  });

  it("returns null from the single-id wrapper when no row comes back", async () => {
    const { resolveOwnerProfileId } = await import("../resource-ownership");
    queryMock.mockResolvedValueOnce([]);

    await expect(resolveOwnerProfileId("lead", "absent")).resolves.toBeNull();
  });
});
