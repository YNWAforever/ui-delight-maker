import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireNeonAuthSessionMock, searchWorkspaceMock, createServerFnChain } = vi.hoisted(() => {
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
    searchWorkspaceMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain }));
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));
vi.mock("@/server/repositories/workspace-search", () => ({
  searchWorkspace: searchWorkspaceMock,
}));

describe("workspace search server function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireNeonAuthSessionMock.mockResolvedValue({ user: { id: "profile-1" } });
    searchWorkspaceMock.mockResolvedValue([]);
  });

  it("authenticates and forwards a trimmed query", async () => {
    const { searchWorkspace } = await import("../search");

    await expect(searchWorkspace({ data: { query: "  Acme  ", limit: 10 } })).resolves.toEqual([]);
    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(searchWorkspaceMock).toHaveBeenCalledWith("Acme", 10);
  });
});
