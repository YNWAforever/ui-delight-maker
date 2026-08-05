import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireNeonAuthSessionMock,
  listWorkspaceViewsMock,
  listWorkspaceFavoritesMock,
  saveWorkspaceViewMock,
  toggleWorkspaceFavoriteMock,
  createServerFnChain,
} = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: unknown[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    requireNeonAuthSessionMock: vi.fn(),
    listWorkspaceViewsMock: vi.fn(),
    listWorkspaceFavoritesMock: vi.fn(),
    saveWorkspaceViewMock: vi.fn(),
    toggleWorkspaceFavoriteMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));

vi.mock("@/server/repositories/workspace-preferences", () => ({
  listWorkspaceViews: listWorkspaceViewsMock,
  listWorkspaceFavorites: listWorkspaceFavoritesMock,
  saveWorkspaceView: saveWorkspaceViewMock,
  toggleWorkspaceFavorite: toggleWorkspaceFavoriteMock,
}));

describe("workspace preference server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireNeonAuthSessionMock.mockResolvedValue({
      user: { id: "profile-1" },
      profile: { id: "profile-1", role: "sales", status: "active" },
      session: {},
    });
    listWorkspaceViewsMock.mockResolvedValue([]);
    listWorkspaceFavoritesMock.mockResolvedValue([]);
  });

  it("loads preferences for the authenticated profile only", async () => {
    const { getWorkspacePreferences } = await import("../workspace-preferences");

    await expect(getWorkspacePreferences({ data: { objectType: "account" } })).resolves.toEqual({
      views: [],
      favorites: [],
    });
    expect(listWorkspaceViewsMock).toHaveBeenCalledWith("profile-1", "account");
    expect(listWorkspaceFavoritesMock).toHaveBeenCalledWith("profile-1");
  });

  it("injects the authenticated profile when saving a view", async () => {
    saveWorkspaceViewMock.mockResolvedValue({ id: "view-1" });
    const { savePersonalWorkspaceView } = await import("../workspace-preferences");

    await savePersonalWorkspaceView({
      data: {
        objectType: "account",
        name: "At risk",
        config: { filters: {}, columns: ["name"], sort: { field: "name", direction: "asc" } },
      },
    });

    expect(saveWorkspaceViewMock).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: "profile-1", name: "At risk" }),
    );
  });

  it("rejects caller-supplied profile IDs", async () => {
    const { savePersonalWorkspaceView } = await import("../workspace-preferences");

    await expect(
      savePersonalWorkspaceView({
        data: {
          profileId: "profile-2",
          objectType: "account",
          name: "Spoofed",
          config: { filters: {}, columns: ["name"], sort: { field: "name", direction: "asc" } },
        },
      } as never),
    ).rejects.toThrow("profileId is managed by the authenticated session");
    expect(saveWorkspaceViewMock).not.toHaveBeenCalled();
  });
});
