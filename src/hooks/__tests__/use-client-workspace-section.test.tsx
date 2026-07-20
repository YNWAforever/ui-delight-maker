// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crmQueryKeys } from "@/lib/query-keys";

const { getClientWorkspaceSectionMock } = vi.hoisted(() => ({
  getClientWorkspaceSectionMock: vi.fn(),
}));

vi.mock("@/server-functions/client-workspace", () => ({
  getClientWorkspaceSection: getClientWorkspaceSectionMock,
}));

import {
  CLIENT_WORKSPACE_STALE_TIME_MS,
  useClientWorkspaceSection,
} from "../use-client-workspace-section";

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return {
    queryClient,
    QueryWrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    },
  };
}

afterEach(() => {
  cleanup();
  getClientWorkspaceSectionMock.mockReset();
});

describe("useClientWorkspaceSection", () => {
  it("fetches only after a client tab is open", async () => {
    const closed = createQueryWrapper();
    renderHook(() => useClientWorkspaceSection("client-1", "activity", { enabled: false }), {
      wrapper: closed.QueryWrapper,
    });
    expect(getClientWorkspaceSectionMock).not.toHaveBeenCalled();

    const missingClient = createQueryWrapper();
    renderHook(() => useClientWorkspaceSection("", "activity", { enabled: true }), {
      wrapper: missingClient.QueryWrapper,
    });
    expect(getClientWorkspaceSectionMock).not.toHaveBeenCalled();

    getClientWorkspaceSectionMock.mockResolvedValueOnce({
      status: "ready",
      data: { activityLogs: [] },
    });
    const open = createQueryWrapper();
    const { result } = renderHook(
      () => useClientWorkspaceSection("client-1", "activity", { enabled: true }),
      { wrapper: open.QueryWrapper },
    );

    await waitFor(() => expect(result.current.data?.status).toBe("ready"));
    expect(getClientWorkspaceSectionMock).toHaveBeenCalledWith({
      data: { clientId: "client-1", section: "activity" },
    });
  });

  it("uses the shared workspace stale policy with the client section query key", async () => {
    getClientWorkspaceSectionMock.mockResolvedValue({
      status: "empty",
      data: { contacts: [] },
    });
    const { queryClient, QueryWrapper } = createQueryWrapper();

    renderHook(() => useClientWorkspaceSection("client-1", "contacts", { enabled: true }), {
      wrapper: QueryWrapper,
    });

    await waitFor(() => expect(getClientWorkspaceSectionMock).toHaveBeenCalledTimes(1));
    const query = queryClient.getQueryCache().find({
      queryKey: crmQueryKeys.clients.section("client-1", "contacts"),
    });
    expect(query?.options.staleTime).toBe(CLIENT_WORKSPACE_STALE_TIME_MS);
    expect(query?.options.refetchOnWindowFocus).toBe(true);
    expect(query?.options.retry).toBe(false);
  });

  it("retries a transient client section error exactly once", async () => {
    getClientWorkspaceSectionMock
      .mockResolvedValueOnce({
        status: "error",
        error: {
          code: "query_timeout",
          requestId: "request-1",
          retryable: true,
          section: "activity",
        },
      })
      .mockResolvedValueOnce({ status: "ready", data: { activityLogs: [] } });

    const { QueryWrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useClientWorkspaceSection("client-1", "activity", { enabled: true }),
      { wrapper: QueryWrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ status: "ready", data: { activityLogs: [] } });
    });
    expect(getClientWorkspaceSectionMock).toHaveBeenCalledTimes(2);
  });

  it("retains the last ready client data when a refresh fails", async () => {
    getClientWorkspaceSectionMock.mockResolvedValueOnce({
      status: "ready",
      data: { activityLogs: [{ id: "event-1" }] },
    });
    const { QueryWrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useClientWorkspaceSection("client-1", "activity", { enabled: true }),
      { wrapper: QueryWrapper },
    );
    await waitFor(() => expect(result.current.data?.status).toBe("ready"));

    getClientWorkspaceSectionMock.mockResolvedValueOnce({
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
      expect(getClientWorkspaceSectionMock).toHaveBeenCalledTimes(2);
      expect(result.current.data).toMatchObject({
        status: "error",
        staleData: { activityLogs: [{ id: "event-1" }] },
      });
    });
  });
});
