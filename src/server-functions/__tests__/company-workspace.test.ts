import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireNeonAuthSessionMock,
  loadCompanyWorkspaceCoreMock,
  loadCompanyWorkspaceSectionMock,
  createServerFnChain,
} = vi.hoisted(() => {
  const createServerFnChain = () => {
    let validatorFn: (data: unknown) => unknown = (data) => data;
    return {
      validator(validator: (data: unknown) => unknown) {
        validatorFn = validator;
        return this;
      },
      handler<T extends (...args: never[]) => unknown>(handler: T) {
        return async (args: { data: unknown }) =>
          handler({ ...args, data: validatorFn(args.data) });
      },
    };
  };

  return {
    requireNeonAuthSessionMock: vi.fn(),
    loadCompanyWorkspaceCoreMock: vi.fn(),
    loadCompanyWorkspaceSectionMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain() }));
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));
vi.mock("@/server/company-workspace/loaders", () => ({
  loadCompanyWorkspaceCore: loadCompanyWorkspaceCoreMock,
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

  it("does not expose an aggregate workspace server function", async () => {
    const module = await import("../company-workspace");
    expect("getCompanyWorkspace" in module).toBe(false);
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

  it("rejects an unknown Company Workspace section before querying", async () => {
    const { getCompanyWorkspaceSection } = await import("../company-workspace");

    await expect(
      getCompanyWorkspaceSection({
        data: { accountId: "account-1", section: "unknown" },
      }),
    ).rejects.toThrow("Invalid Company Workspace section");

    expect(loadCompanyWorkspaceSectionMock).not.toHaveBeenCalled();
  });
});
