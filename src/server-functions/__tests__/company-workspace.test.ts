import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireNeonAuthSessionMock,
  loadCompanyWorkspaceCoreMock,
  loadCompanyWorkspaceMock,
  loadCompanyWorkspaceSectionMock,
  createServerFnChain,
} = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    requireNeonAuthSessionMock: vi.fn(),
    loadCompanyWorkspaceCoreMock: vi.fn(),
    loadCompanyWorkspaceMock: vi.fn(),
    loadCompanyWorkspaceSectionMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain }));
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));
vi.mock("@/server/company-workspace/loaders", () => ({
  loadCompanyWorkspaceCore: loadCompanyWorkspaceCoreMock,
  loadCompanyWorkspace: loadCompanyWorkspaceMock,
  loadCompanyWorkspaceSection: loadCompanyWorkspaceSectionMock,
}));

describe("Company Workspace server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireNeonAuthSessionMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("authenticates before loading the stable core", async () => {
    loadCompanyWorkspaceCoreMock.mockResolvedValue({ company: { id: "account-1" } });
    const { getCompanyWorkspaceCore } = await import("../company-workspace");

    await expect(getCompanyWorkspaceCore({ data: { accountId: "account-1" } })).resolves.toEqual({
      company: { id: "account-1" },
    });
    expect(requireNeonAuthSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      loadCompanyWorkspaceCoreMock.mock.invocationCallOrder[0],
    );
    expect(loadCompanyWorkspaceCoreMock).toHaveBeenCalledWith("account-1");
  });

  it("loads every optional section through the resilient aggregate", async () => {
    loadCompanyWorkspaceMock.mockResolvedValue({ sections: { activity: { status: "empty" } } });
    const { getCompanyWorkspace } = await import("../company-workspace");

    await getCompanyWorkspace({ data: { accountId: "account-1" } });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(loadCompanyWorkspaceMock).toHaveBeenCalledWith("account-1");
  });

  it("loads one optional section for independent retries", async () => {
    loadCompanyWorkspaceSectionMock.mockResolvedValue({ status: "empty", data: { timeline: [] } });
    const { getCompanyWorkspaceSection } = await import("../company-workspace");

    await getCompanyWorkspaceSection({
      data: { accountId: "account-1", section: "activity" },
    });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(loadCompanyWorkspaceSectionMock).toHaveBeenCalledWith("account-1", "activity");
  });
});
