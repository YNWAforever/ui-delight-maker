import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAnyCapabilityMock, searchWorkspaceMock, createServerFnChain } = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: unknown[]) => unknown>(handler: T) {
      return handler;
    },
  };
  return {
    requireAnyCapabilityMock: vi.fn(),
    searchWorkspaceMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain }));
vi.mock("@/server/auth/authorization.server", () => ({
  requireAnyCapability: requireAnyCapabilityMock,
}));
vi.mock("@/server/repositories/workspace-search", () => ({
  searchWorkspace: searchWorkspaceMock,
}));

describe("workspace search server function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAnyCapabilityMock.mockResolvedValue({ user: { id: "profile-1" } });
    searchWorkspaceMock.mockResolvedValue([]);
  });

  it("authorizes against any searchable entity, then forwards a trimmed query", async () => {
    const { searchWorkspace } = await import("../search");

    await expect(searchWorkspace({ data: { query: "  Acme  ", limit: 10 } })).resolves.toEqual([]);
    // The query spans accounts, contacts, leads and quotes, so any one view capability
    // suffices. A bare session check previously skipped permission overrides and manager
    // scope entirely.
    expect(requireAnyCapabilityMock).toHaveBeenCalledWith([
      "accounts.view",
      "contacts.view",
      "leads.view",
      "quotes.view",
    ]);
    expect(searchWorkspaceMock).toHaveBeenCalledWith("Acme", 10);
  });
});
