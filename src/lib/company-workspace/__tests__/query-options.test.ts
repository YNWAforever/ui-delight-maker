import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "@/lib/types";
import type { CompanyWorkspaceResponse } from "@/lib/company-workspace/types";
import { companyWorkspaceKeys } from "../query-keys";
import { companyWorkspaceSectionOptions } from "../query-options";
import { seedCompanyWorkspaceCache } from "../cache";

const { getCompanyWorkspaceMock } = vi.hoisted(() => ({
  getCompanyWorkspaceMock: vi.fn(),
}));

vi.mock("@/server-functions/company-workspace", () => ({
  getCompanyWorkspace: getCompanyWorkspaceMock,
}));

function createWorkspaceResponseWithCoreAndOverview(): CompanyWorkspaceResponse {
  const meta = {
    correlationId: "corr-1",
    fetchedAt: "2026-08-08T00:00:00.000Z",
    durationMs: 1,
    source: "network" as const,
  };

  return {
    accountId: "account-1",
    sections: {
      core: {
        status: "ready",
        data: { account: { id: "account-1", name: "Acme" } as Account, peopleCount: 0 },
        meta,
      },
      overview: {
        status: "empty",
        data: {
          openSignals: [],
          openSignalCount: 0,
          linkedClients: [],
          activeEngagementCount: 0,
          quoteSummaries: [],
        },
        meta,
      },
    },
    meta: { correlationId: "corr-1", generatedAt: "2026-08-08T00:00:00.000Z" },
  };
}

describe("company workspace query options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a 30-second stale time and section-specific key", () => {
    const options = companyWorkspaceSectionOptions("account-1", "activity");

    expect(options.queryKey).toEqual(["company-workspace", "account-1", "activity"]);
    expect(options.staleTime).toBe(30_000);
    expect(options.refetchOnWindowFocus).toBe(true);
  });

  it("requests one section through the server adapter", async () => {
    const section = { status: "empty" as const };
    getCompanyWorkspaceMock.mockResolvedValue({ sections: { activity: section } });
    const options = companyWorkspaceSectionOptions("account-1", "activity");

    await expect(options.queryFn?.({ queryKey: options.queryKey } as never)).resolves.toBe(section);

    expect(getCompanyWorkspaceMock).toHaveBeenCalledWith({
      data: { accountId: "account-1", sections: ["activity"] },
    });
  });

  it("seeds each returned section independently", () => {
    const queryClient = new QueryClient();
    const response = createWorkspaceResponseWithCoreAndOverview();

    seedCompanyWorkspaceCache(queryClient, "account-1", response);

    expect(queryClient.getQueryData(companyWorkspaceKeys.section("account-1", "core"))).toEqual(
      response.sections.core,
    );
    expect(
      queryClient.getQueryData(companyWorkspaceKeys.section("account-1", "overview")),
    ).toEqual(response.sections.overview);
  });
});
