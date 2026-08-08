import { QueryClient, QueryObserver } from "@tanstack/react-query";
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
    expect(queryClient.getQueryData(companyWorkspaceKeys.section("account-1", "overview"))).toEqual(
      response.sections.overview,
    );
  });

  it("retains a ready overview and exposes a correlated error when a refetch returns a section error", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const response = createWorkspaceResponseWithCoreAndOverview();
    const readyOverview = {
      ...response.sections.overview!,
      status: "ready" as const,
    };
    response.sections.overview = readyOverview;
    seedCompanyWorkspaceCache(queryClient, "account-1", response);
    getCompanyWorkspaceMock.mockResolvedValue({
      sections: {
        overview: {
          status: "error",
          error: {
            code: "SECTION_READ_FAILED",
            message: "This workspace section is temporarily unavailable. Please try again.",
          },
          meta: {
            correlationId: "corr-refetch-failure",
            fetchedAt: "2026-08-08T00:00:01.000Z",
            durationMs: 1,
            source: "network",
          },
        },
      },
    });
    const options = companyWorkspaceSectionOptions("account-1", "overview");
    const observer = new QueryObserver(queryClient, options);
    const unsubscribe = observer.subscribe(() => {});

    try {
      await expect(observer.refetch({ throwOnError: true })).rejects.toMatchObject({
        message: "This workspace section is temporarily unavailable. Please try again.",
        correlationId: "corr-refetch-failure",
      });

      const result = observer.getCurrentResult();
      expect(result.data).toEqual(readyOverview);
      expect(result.isError).toBe(true);

      await expect(observer.refetch({ throwOnError: true })).rejects.toMatchObject({
        correlationId: "corr-refetch-failure",
      });
      expect(getCompanyWorkspaceMock).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
  });
});
