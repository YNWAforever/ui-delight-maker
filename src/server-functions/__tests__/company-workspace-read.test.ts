import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCapabilitySet, loadRequestAuthorizationMock, loadRead, createServerFnChain } =
  vi.hoisted(() => {
    const createServerFnChain = () => {
      let validatorFn: (data: unknown) => unknown = (data) => data;
      return {
        validator(validator: (data: unknown) => unknown) {
          validatorFn = validator;
          return this;
        },
        handler<T extends (...args: never[]) => unknown>(handler: T) {
          const invoke = handler as unknown as (args: { data: unknown }) => unknown;
          return async (args: { data: unknown }) =>
            invoke({ ...args, data: validatorFn(args.data) });
        },
      };
    };
    return {
      requireCapabilitySet: vi.fn(),
      loadRequestAuthorizationMock: vi.fn(),
      loadRead: vi.fn(),
      createServerFnChain,
    };
  });

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain() }));
vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: vi.fn(),
  requireCapabilitySet,
  loadRequestAuthorization: loadRequestAuthorizationMock,
}));
vi.mock("@/server/company-workspace/loaders", () => ({
  loadCompanyWorkspaceCore: vi.fn(),
  loadCompanyWorkspaceSection: vi.fn(),
  loadCompanyWorkspaceRead: loadRead,
}));

describe("Company Workspace deep read server function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCapabilitySet.mockResolvedValue({});
    loadRequestAuthorizationMock.mockResolvedValue({
      actor: { profileId: "user-1" },
      overrides: [],
    });
    loadRead.mockResolvedValue({ requestId: "request-1", sections: {} });
  });

  it("validates one request and authorizes the union of every requested section before load", async () => {
    const { getCompanyWorkspaceRead } = await import("../company-workspace");

    await getCompanyWorkspaceRead({
      data: { accountId: "account-1", sections: ["activity", "commercial"] },
    });

    // One call for the whole read: the account guard plus every requested section's data
    // capabilities, so a section cannot be loaded under a capability that never covered it.
    expect(requireCapabilitySet).toHaveBeenCalledTimes(1);
    expect(requireCapabilitySet).toHaveBeenCalledWith(
      ["accounts.view", "engagements.view", "leads.view", "quotes.view"],
      {
        target: { resourceType: "account", resourceId: "account-1" },
        context: expect.anything(),
      },
    );
    expect(requireCapabilitySet.mock.invocationCallOrder[0]).toBeLessThan(
      loadRead.mock.invocationCallOrder[0],
    );
    expect(loadRead).toHaveBeenCalledWith(
      "account-1",
      ["activity", "commercial"],
      undefined,
      undefined,
      expect.anything(),
    );
  });

  it("keeps the account guard on a core-only read with no sections", async () => {
    const { getCompanyWorkspaceRead } = await import("../company-workspace");

    await getCompanyWorkspaceRead({ data: { accountId: "account-1", sections: [] } });

    expect(requireCapabilitySet).toHaveBeenCalledWith(["accounts.view"], {
      target: { resourceType: "account", resourceId: "account-1" },
      context: expect.anything(),
    });
    expect(loadRead).toHaveBeenCalled();
  });

  it("does not load any section when the requested capability set is denied", async () => {
    requireCapabilitySet.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const { getCompanyWorkspaceRead } = await import("../company-workspace");

    await expect(
      getCompanyWorkspaceRead({ data: { accountId: "account-1", sections: ["commercial"] } }),
    ).rejects.toThrow("FORBIDDEN");

    expect(loadRead).not.toHaveBeenCalled();
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
    expect(requireCapabilitySet).not.toHaveBeenCalled();
  });

  it("rejects blank account IDs and explicit null sections before authorizing", async () => {
    const { getCompanyWorkspaceRead } = await import("../company-workspace");

    await expect(
      getCompanyWorkspaceRead({ data: { accountId: "  ", sections: [] } }),
    ).rejects.toThrow("account ID is required");
    await expect(
      getCompanyWorkspaceRead({ data: { accountId: "account-1", sections: null } }),
    ).rejects.toThrow("sections must be an array");
    expect(requireCapabilitySet).not.toHaveBeenCalled();
  });
});
