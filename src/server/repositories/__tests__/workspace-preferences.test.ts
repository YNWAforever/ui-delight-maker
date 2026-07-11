import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

describe("workspace preferences repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists only a profile's Account views", async () => {
    mockQuery.mockResolvedValue([]);
    const { listWorkspaceViews } = await import("../workspace-preferences");

    await listWorkspaceViews("profile-1", "account");

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("from workspace_views"), [
      "profile-1",
      "account",
    ]);
  });

  it("normalizes saved view configuration returned from Neon", async () => {
    mockQueryOne.mockResolvedValue({
      id: "view-1",
      profile_id: "profile-1",
      object_type: "account",
      name: "At risk",
      config: { columns: ["name", "bad"] },
      is_default: false,
    });
    const { saveWorkspaceView } = await import("../workspace-preferences");

    const view = await saveWorkspaceView({
      profileId: "profile-1",
      objectType: "account",
      name: "At risk",
      config: { columns: ["name", "bad"] },
    });

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("insert into workspace_views"),
      expect.arrayContaining(["profile-1", "account", "At risk"]),
    );
    expect(view.config.columns).toEqual(["name"]);
  });

  it("creates a favorite within one profile", async () => {
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "favorite-1", profile_id: "profile-1" });
    const { toggleWorkspaceFavorite } = await import("../workspace-preferences");

    await expect(
      toggleWorkspaceFavorite({
        profileId: "profile-1",
        kind: "account",
        label: "Acme",
        href: "/accounts/a1",
        accountId: "a1",
      }),
    ).resolves.toMatchObject({ id: "favorite-1" });
  });

  it("removes an existing favorite only for its owning profile", async () => {
    mockQueryOne.mockResolvedValue({ id: "favorite-1", profile_id: "profile-1" });
    mockQuery.mockResolvedValue([]);
    const { toggleWorkspaceFavorite } = await import("../workspace-preferences");

    await expect(
      toggleWorkspaceFavorite({
        profileId: "profile-1",
        kind: "account",
        label: "Acme",
        href: "/accounts/a1",
        accountId: "a1",
      }),
    ).resolves.toBeNull();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("delete from workspace_favorites"),
      ["favorite-1", "profile-1"],
    );
  });
});
