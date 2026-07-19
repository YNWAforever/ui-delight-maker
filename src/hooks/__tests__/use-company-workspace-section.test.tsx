// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getCompanyWorkspaceSectionMock } = vi.hoisted(() => ({
  getCompanyWorkspaceSectionMock: vi.fn(),
}));

vi.mock("@/server-functions/company-workspace", () => ({
  getCompanyWorkspaceSection: getCompanyWorkspaceSectionMock,
}));

import { useCompanyWorkspaceSection } from "../use-company-workspace-section";

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function QueryWrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  cleanup();
  getCompanyWorkspaceSectionMock.mockReset();
});

describe("useCompanyWorkspaceSection", () => {
  it("retries a retryable section error exactly once", async () => {
    getCompanyWorkspaceSectionMock
      .mockResolvedValueOnce({
        status: "error",
        error: {
          code: "query_timeout",
          requestId: "request-1",
          retryable: true,
          section: "activity",
        },
      })
      .mockResolvedValueOnce({ status: "ready", data: { timeline: [] } });

    const { result } = renderHook(() => useCompanyWorkspaceSection("account-1", "activity"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() =>
      expect(result.current.data).toEqual({ status: "ready", data: { timeline: [] } }),
    );
    expect(getCompanyWorkspaceSectionMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a schema mismatch", async () => {
    getCompanyWorkspaceSectionMock.mockResolvedValue({
      status: "error",
      error: {
        code: "schema_mismatch",
        requestId: "request-2",
        retryable: false,
        section: "activity",
      },
    });

    const { result } = renderHook(() => useCompanyWorkspaceSection("account-1", "activity"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.data?.status).toBe("error"));
    expect(getCompanyWorkspaceSectionMock).toHaveBeenCalledTimes(1);
  });

  it("stops after the second retryable response", async () => {
    getCompanyWorkspaceSectionMock
      .mockResolvedValueOnce({
        status: "error",
        error: {
          code: "query_timeout",
          requestId: "request-1",
          retryable: true,
          section: "activity",
        },
      })
      .mockResolvedValueOnce({
        status: "error",
        error: {
          code: "query_timeout",
          requestId: "request-2",
          retryable: true,
          section: "activity",
        },
      });

    const { result } = renderHook(() => useCompanyWorkspaceSection("account-1", "activity"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() =>
      expect(result.current.data).toMatchObject({
        status: "error",
        error: { requestId: "request-2" },
      }),
    );
    expect(getCompanyWorkspaceSectionMock).toHaveBeenCalledTimes(2);
  });
  it("retains last-known data when a refresh fails", async () => {
    getCompanyWorkspaceSectionMock.mockResolvedValueOnce({
      status: "ready",
      data: { timeline: [{ id: "event-1" }] },
    });

    const { result } = renderHook(() => useCompanyWorkspaceSection("account-1", "activity"), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.data?.status).toBe("ready"));

    getCompanyWorkspaceSectionMock.mockResolvedValueOnce({
      status: "error",
      error: {
        code: "schema_mismatch",
        requestId: "request-refresh",
        retryable: false,
        section: "activity",
      },
    });
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(getCompanyWorkspaceSectionMock).toHaveBeenCalledTimes(2);
      expect(result.current.data).toMatchObject({
        status: "error",
        staleData: { timeline: [{ id: "event-1" }] },
      });
    });
  });
});
