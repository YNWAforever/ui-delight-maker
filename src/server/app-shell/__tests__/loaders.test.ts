import { afterEach, describe, expect, it, vi } from "vitest";
import { isRedirect } from "@tanstack/react-router";
import { loadAuthenticatedShell } from "../loaders";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const session = {
  user: { id: "user-1", email: "person@example.com", name: "Person" },
  profile: { id: "profile-1", name: "Person" },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("authenticated application shell loader", () => {
  it("reads the session once and starts independent optional data concurrently", async () => {
    const preferences = deferred<{ favorites: [] }>();
    const navigation = deferred<[]>();
    const getSession = vi.fn().mockResolvedValue(session);
    const getPreferences = vi.fn(() => preferences.promise);
    const getAdminNavigation = vi.fn(() => navigation.promise);
    const getCapabilities = vi.fn().mockResolvedValue([]);

    const read = loadAuthenticatedShell({
      getSession,
      getPreferences,
      getAdminNavigation,
      getCapabilities,
    });

    await vi.waitFor(() => {
      expect(getPreferences).toHaveBeenCalledOnce();
      expect(getAdminNavigation).toHaveBeenCalledOnce();
    });
    expect(getSession).toHaveBeenCalledOnce();

    preferences.resolve({ favorites: [] });
    navigation.resolve([]);

    await expect(read).resolves.toMatchObject({
      user: session.user,
      profile: session.profile,
      favorites: [],
      adminNavigation: [],
    });
  });

  it("keeps optional preferences and navigation failures local", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      loadAuthenticatedShell({
        getSession: vi.fn().mockResolvedValue(session),
        getPreferences: vi.fn().mockRejectedValue(new Error("preferences unavailable")),
        getAdminNavigation: vi.fn().mockRejectedValue(new Error("navigation unavailable")),
        getCapabilities: vi.fn().mockResolvedValue([]),
      }),
    ).resolves.toMatchObject({ favorites: [], adminNavigation: [] });

    expect(log).toHaveBeenCalledTimes(2);
  });

  it("throws the existing redirect-compatible error when the session is missing", async () => {
    await expect(
      loadAuthenticatedShell({
        getSession: vi.fn().mockResolvedValue(null),
        getPreferences: vi.fn(),
        getAdminNavigation: vi.fn(),
        getCapabilities: vi.fn(),
      }),
    ).rejects.toSatisfy(isRedirect);
  });

  it("carries the actor's capabilities", async () => {
    const read = await loadAuthenticatedShell({
      getSession: vi.fn().mockResolvedValue(session),
      getPreferences: vi.fn().mockResolvedValue({ favorites: [] }),
      getAdminNavigation: vi.fn().mockResolvedValue([]),
      getCapabilities: vi.fn().mockResolvedValue(["quotes.view", "quotes.create"]),
    });

    expect(read.capabilities).toEqual(["quotes.view", "quotes.create"]);
  });

  it("falls back to no capabilities when the resolve fails", async () => {
    // Fail closed, matching how favorites and navigation already degrade. An empty set
    // disables controls the actor may in fact hold, which a reload fixes; the opposite -
    // assuming permission - would offer actions the server then refuses. The server
    // enforces either way, so this costs nothing but a disabled button.
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const read = await loadAuthenticatedShell({
      getSession: vi.fn().mockResolvedValue(session),
      getPreferences: vi.fn().mockResolvedValue({ favorites: [] }),
      getAdminNavigation: vi.fn().mockResolvedValue([]),
      getCapabilities: vi.fn().mockRejectedValue(new Error("authorization context unavailable")),
    });

    expect(read.capabilities).toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
  });
});
