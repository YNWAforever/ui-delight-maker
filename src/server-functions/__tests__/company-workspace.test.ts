import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireCapabilityMock,
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
        const invoke = handler as unknown as (args: { data: unknown }) => unknown;
        return async (args: { data: unknown }) => invoke({ ...args, data: validatorFn(args.data) });
      },
    };
  };

  return {
    requireCapabilityMock: vi.fn(),
    loadCompanyWorkspaceCoreMock: vi.fn(),
    loadCompanyWorkspaceSectionMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain() }));
vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: requireCapabilityMock,
}));
vi.mock("@/server/company-workspace/loaders", () => ({
  loadCompanyWorkspaceCore: loadCompanyWorkspaceCoreMock,
  loadCompanyWorkspaceSection: loadCompanyWorkspaceSectionMock,
}));

describe("Company Workspace server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCapabilityMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("checks accounts.view on the target account before loading the stable core", async () => {
    loadCompanyWorkspaceCoreMock.mockResolvedValue({ company: { id: "account-1" } });
    const { getCompanyWorkspaceCore } = await import("../company-workspace");

    await expect(getCompanyWorkspaceCore({ data: { accountId: "account-1" } })).resolves.toEqual({
      company: { id: "account-1" },
    });
    expect(requireCapabilityMock.mock.invocationCallOrder[0]).toBeLessThan(
      loadCompanyWorkspaceCoreMock.mock.invocationCallOrder[0],
    );
    expect(loadCompanyWorkspaceCoreMock).toHaveBeenCalledWith("account-1");
  });

  it("loads one optional section for independent retries", async () => {
    loadCompanyWorkspaceSectionMock.mockResolvedValue({ status: "empty", data: { timeline: [] } });
    const { getCompanyWorkspaceSection } = await import("../company-workspace");

    await getCompanyWorkspaceSection({
      data: { accountId: "account-1", section: "activity" },
    });

    expect(requireCapabilityMock).toHaveBeenCalled();
    expect(loadCompanyWorkspaceSectionMock).toHaveBeenCalledWith("account-1", "activity");
  });

  it("rejects a missing account ID for the core read before querying", async () => {
    const { getCompanyWorkspaceCore } = await import("../company-workspace");
    const invoke = () => getCompanyWorkspaceCore({ data: {} });

    await expect(invoke()).rejects.toThrow("Company Workspace account ID is required");

    expect(requireCapabilityMock).not.toHaveBeenCalled();
    expect(loadCompanyWorkspaceCoreMock).not.toHaveBeenCalled();
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
