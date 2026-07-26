import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSession, loadRead, createServerFnChain } = vi.hoisted(() => {
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
  return { requireSession: vi.fn(), loadRead: vi.fn(), createServerFnChain };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain() }));
vi.mock("@/server/auth/authorization.server", () => ({ requireCapability: requireSession }));
vi.mock("@/server/company-workspace/loaders", () => ({
  loadCompanyWorkspaceCore: vi.fn(),
  loadCompanyWorkspaceSection: vi.fn(),
  loadCompanyWorkspaceRead: loadRead,
}));

describe("Company Workspace deep read server function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSession.mockResolvedValue({ user: { id: "user-1" } });
    loadRead.mockResolvedValue({ requestId: "request-1", sections: {} });
  });

  it("validates one request and authorizes once for all requested sections", async () => {
    const { getCompanyWorkspaceRead } = await import("../company-workspace");

    await getCompanyWorkspaceRead({
      data: { accountId: "account-1", sections: ["activity", "commercial"] },
    });

    expect(requireSession).toHaveBeenCalledTimes(1);
    expect(loadRead).toHaveBeenCalledWith("account-1", ["activity", "commercial"]);
  });

  it("rejects duplicate or unknown section names before authorizing", async () => {
    const { getCompanyWorkspaceRead } = await import("../company-workspace");

    await expect(
      getCompanyWorkspaceRead({
        data: { accountId: "account-1", sections: ["activity", "activity"] },
      }),
    ).rejects.toThrow("unique");
    await expect(
      getCompanyWorkspaceRead({ data: { accountId: "account-1", sections: ["unknown"] } }),
    ).rejects.toThrow("Invalid Company Workspace section");
    expect(requireSession).not.toHaveBeenCalled();
  });

  it("rejects blank account IDs and explicit null sections before authorizing", async () => {
    const { getCompanyWorkspaceRead } = await import("../company-workspace");

    await expect(
      getCompanyWorkspaceRead({ data: { accountId: "  ", sections: [] } }),
    ).rejects.toThrow("account ID is required");
    await expect(
      getCompanyWorkspaceRead({ data: { accountId: "account-1", sections: null } }),
    ).rejects.toThrow("sections must be an array");
    expect(requireSession).not.toHaveBeenCalled();
  });
});
