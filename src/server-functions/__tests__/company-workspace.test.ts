import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadCompanyWorkspaceMock, createServerFnChain } = vi.hoisted(() => {
  let validate: (data: unknown) => unknown = (data) => data;
  const createServerFnChain = {
    validator(validator: (data: unknown) => unknown) {
      validate = validator;
      return createServerFnChain;
    },
    handler<T>(handler: ({ data }: { data: unknown }) => T) {
      return async ({ data }: { data: unknown }) => handler({ data: validate(data) });
    },
  };

  return {
    loadCompanyWorkspaceMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/server/company-workspace/read-model", () => ({
  loadCompanyWorkspace: loadCompanyWorkspaceMock,
}));

describe("company workspace server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates the account workspace request to the deep read model", async () => {
    loadCompanyWorkspaceMock.mockResolvedValue({
      accountId: "account-1",
      sections: {},
      meta: { correlationId: "corr-1", generatedAt: "2026-08-08T00:00:00.000Z" },
    });
    const { getCompanyWorkspace } = await import("../company-workspace");

    await getCompanyWorkspace({
      data: { accountId: "account-1", sections: ["overview"] },
    });

    expect(loadCompanyWorkspaceMock).toHaveBeenCalledWith({
      accountId: "account-1",
      sections: ["overview"],
    });
  });

  it.each([
    { accountId: "", sections: ["overview"] },
    { accountId: "   ", sections: ["overview"] },
    { accountId: "account-1", sections: [] },
    { accountId: "account-1", sections: [""] },
    { accountId: "account-1", sections: ["not-a-section"] },
  ])("rejects invalid account and section values before entering the read model", async (data) => {
    const { getCompanyWorkspace } = await import("../company-workspace");

    await expect(getCompanyWorkspace({ data })).rejects.toThrow(
      "Invalid company workspace request",
    );
    expect(loadCompanyWorkspaceMock).not.toHaveBeenCalled();
  });

  it.each([null, "fresh", "stale-while-revalidate"])(
    "rejects invalid freshness values before entering the read model",
    async (freshness) => {
      const { getCompanyWorkspace } = await import("../company-workspace");

      await expect(
        getCompanyWorkspace({
          data: { accountId: "account-1", sections: ["overview"], freshness },
        }),
      ).rejects.toThrow("Invalid company workspace request");
      expect(loadCompanyWorkspaceMock).not.toHaveBeenCalled();
    },
  );

  it("accepts every public section and freshness value", async () => {
    loadCompanyWorkspaceMock.mockResolvedValue({
      accountId: "account-1",
      sections: {},
      meta: { correlationId: "corr-1", generatedAt: "2026-08-08T00:00:00.000Z" },
    });
    const { getCompanyWorkspace } = await import("../company-workspace");

    await getCompanyWorkspace({
      data: {
        accountId: " account-1 ",
        sections: ["core", "overview", "stakeholders", "activity", "commercial", "deliveryFinance"],
        freshness: "network-only",
      },
    });

    expect(loadCompanyWorkspaceMock).toHaveBeenCalledWith({
      accountId: "account-1",
      sections: ["core", "overview", "stakeholders", "activity", "commercial", "deliveryFinance"],
      freshness: "network-only",
    });
  });
});
