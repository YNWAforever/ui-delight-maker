import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadCompanyWorkspaceMock, createServerFnChain } = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: any[]) => any>(handler: T) {
      return handler;
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
});
