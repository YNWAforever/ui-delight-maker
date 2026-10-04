// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentQueueSearchSchema } from "@/lib/agent-queue-input";
import { getAgentQueue } from "@/server-functions/agent-runs";
import { previewAgentRecoveryFn } from "@/server-functions/agent-bulk-recovery";
import { crmQueryKeys } from "@/lib/query-keys";
import { QueueToolbar } from "../queue-toolbar";
import { RunQueuePanel } from "../run-queue-panel";
vi.mock("@/server-functions/agent-runs", () => ({ getAgentQueue: vi.fn() }));
vi.mock("@/server-functions/agent-bulk-recovery", () => ({
  previewAgentRecoveryFn: vi.fn(),
  executeAgentRecoveryFn: vi.fn(),
  getAgentRecoveryOperationFn: vi.fn(),
  resumeAgentRecoveryFn: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: ReactNode; search: unknown }) => (
    <a href={"?" + new URLSearchParams(search as Record<string, string>)}>{children}</a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});
const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const result = {
  queue: "runs",
  canRun: true,
  actorId: "queue-actor-a",
  items: [
    {
      id: runId,
      agent_name: "Renamed Draft",
      workflow_type: "draft_reply",
      status: "failed",
      created_at: "2026-10-03T00:00:00Z",
      is_demo: null,
      subject_restricted: true,
      tokens_used: null,
    },
  ],
  totalMatching: 101,
  nextCursor: "bounded-cursor",
  asOf: "2026-10-03T01:00:00Z",
  limit: 25,
};
function mount(filters = agentQueueSearchSchema.parse({})) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const change = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <RunQueuePanel filters={filters} onChange={change} />
    </QueryClientProvider>,
  );
  return { client, change, ...view };
}
describe("server queue navigation", () => {
  it("clears selection for external URL filter changes while retaining same-query pagination", async () => {
    vi.mocked(getAgentQueue).mockResolvedValue({
      ...result,
      totalMatching: 1,
      nextCursor: null,
    } as never);
    const { client, change, rerender } = mount();
    await screen.findByRole("button", { name: "Select this page" });
    fireEvent.click(screen.getByRole("button", { name: "Select this page" }));
    const again = (filters: ReturnType<typeof agentQueueSearchSchema.parse>) =>
      rerender(
        <QueryClientProvider client={client}>
          <RunQueuePanel filters={filters} onChange={change} />
        </QueryClientProvider>,
      );
    again(agentQueueSearchSchema.parse({ cursor: "next-page" }));
    expect(await screen.findByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
      "checked",
      true,
    );
    again(agentQueueSearchSchema.parse({ workflowType: "qualify_lead" }));
    await screen.findByRole("checkbox", { name: "Select run " + runId });
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
        "checked",
        false,
      ),
    );
    expect(screen.queryByRole("button", { name: "Preview 1 selected" })).toBeNull();
    client.clear();
  });
  it("does not restore old selection when all-matching response arrives after a filter change", async () => {
    const one = { ...result, totalMatching: 1, nextCursor: null };
    vi.mocked(getAgentQueue).mockResolvedValue(one as never);
    mount();
    await screen.findByRole("button", { name: "Select all 1 matching runs" });
    let complete!: (value: unknown) => void;
    vi.mocked(getAgentQueue).mockImplementationOnce(
      () =>
        new Promise((r) => {
          complete = r;
        }) as never,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select all 1 matching runs" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Workflow" }), {
      target: { value: "qualify_lead" },
    });
    await act(async () => {
      complete(one);
    });
    expect(screen.queryByRole("button", { name: "Preview 1 selected" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
      "checked",
      false,
    );
  });
  it("polls at 45 seconds only while foreground and resumes after focus", async () => {
    vi.useFakeTimers();
    focusManager.setFocused(true);
    vi.mocked(getAgentQueue).mockResolvedValue(result as never);
    const { client } = mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getAgentQueue).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45000);
    });
    expect(getAgentQueue).toHaveBeenCalledTimes(2);
    focusManager.setFocused(false);
    const hiddenCount = vi.mocked(getAgentQueue).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90000);
    });
    expect(getAgentQueue).toHaveBeenCalledTimes(hiddenCount);
    await act(async () => {
      focusManager.setFocused(true);
      await vi.advanceTimersByTimeAsync(1);
    });
    const resumed = vi.mocked(getAgentQueue).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45000);
    });
    expect(getAgentQueue).toHaveBeenCalledTimes(resumed + 1);
    client.clear();
  });
  it("select all matching is disabled above 100 while page selection remains explicit", async () => {
    vi.mocked(getAgentQueue).mockResolvedValue(result as never);
    mount();
    await screen.findByText(/This page: 1 \/ 101/);
    expect(screen.getByRole("button", { name: "Select all 101 matching runs" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select this page" }));
    expect(screen.getByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.getByRole("button", { name: "Preview 1 selected" })).toBeTruthy();
  });
  it("URL reload and back values preserve filters and cursor in the server request", async () => {
    vi.mocked(getAgentQueue).mockResolvedValue(result as never);
    const filters = agentQueueSearchSchema.parse(
      Object.fromEntries(
        new URLSearchParams(
          "workflowType=draft_reply&status=failed&limit=50&attention=true&cursor=previous-page",
        ),
      ),
    );
    mount(filters);
    await screen.findByText(/This page: 1 \/ 101/);
    expect(getAgentQueue).toHaveBeenCalledWith({ data: { ...filters, queue: "runs" } });
    expect(screen.getByRole("combobox", { name: "Rows per page" })).toHaveProperty("value", "50");
  });
  it("filters and clear start a new page and remove stale deep-link selection", () => {
    const change = vi.fn();
    render(
      <QueueToolbar
        queue="runs"
        value={agentQueueSearchSchema.parse({ cursor: "old", runId, status: "failed" })}
        onChange={change}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Workflow" }), {
      target: { value: "unknown" },
    });
    expect(change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workflowType: "unknown",
        cursor: undefined,
        runId: undefined,
        status: "failed",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear queue filters" }));
    expect(change).toHaveBeenLastCalledWith(agentQueueSearchSchema.parse({}));
  });
  it("keyboard reaches next page and run link locates the exact run", async () => {
    vi.mocked(getAgentQueue).mockResolvedValue(result as never);
    const { change } = mount();
    const link = await screen.findByRole("link", { name: "Renamed Draft" });
    expect(link.getAttribute("href")).toContain("runId=" + runId);
    const next = screen.getByRole("button", { name: "Next run page" });
    next.focus();
    await userEvent.keyboard("{Enter}");
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ cursor: "bounded-cursor" }));
  });
  it("a disappearing last page explicitly resets cursor on refresh", async () => {
    vi.mocked(getAgentQueue).mockResolvedValue({
      ...result,
      items: [],
      nextCursor: null,
      totalMatching: 100,
    } as never);
    const { change } = mount(agentQueueSearchSchema.parse({ cursor: "last-page" }));
    await screen.findByText(/This page no longer matches/);
    fireEvent.click(screen.getByRole("button", { name: "Refresh run queue" }));
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ cursor: undefined }));
  });
  it("loading is distinguishable from empty and unknown usage remains unknown", async () => {
    let resolve!: (data: unknown) => void;
    vi.mocked(getAgentQueue).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }) as never,
    );
    mount();
    expect(screen.getByText("Loading accessible runs…")).toBeTruthy();
    resolve(result);
    await screen.findByText("Tokens: Unknown");
    expect(screen.getByText("Summary restricted.")).toBeTruthy();
    expect(screen.queryByText(/No accessible runs match/)).toBeNull();
  });
  it("error never claims an empty queue and refresh retries the server", async () => {
    vi.mocked(getAgentQueue).mockRejectedValue(new Error("private database failure"));
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByText(/No accessible runs match/)).toBeNull();
    expect(screen.queryByText(/private database failure/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh run queue" }));
    await waitFor(() => expect(getAgentQueue).toHaveBeenCalledTimes(2));
  });
});

describe("server-authorized run maintenance controls", () => {
  it.each([false, undefined])(
    "hides recovery selection when server canRun is %s without hiding reads",
    async (canRun) => {
      vi.mocked(getAgentQueue).mockResolvedValue({ ...result, canRun } as never);
      const { client } = mount();
      await screen.findByText(/This page: 1 \/ 101/);
      expect(screen.queryByRole("checkbox", { name: "Select run " + runId })).toBeNull();
      expect(screen.queryByRole("button", { name: "Select this page" })).toBeNull();
      expect(screen.queryByRole("button", { name: /Select all/ })).toBeNull();
      expect(screen.queryByRole("region", { name: "Local bulk maintenance" })).toBeNull();
      expect(screen.getByRole("link", { name: "Renamed Draft" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Next run page" })).toHaveProperty(
        "disabled",
        false,
      );
      expect(screen.getByRole("button", { name: "Refresh run queue" })).toBeTruthy();
      client.clear();
    },
  );
  it("clears prior selection when server revokes maintenance even if subsequently restored", async () => {
    const value = { ...result, totalMatching: 1, nextCursor: null };
    vi.mocked(getAgentQueue).mockResolvedValue(value as never);
    const { client } = mount();
    await screen.findByRole("button", { name: "Select this page" });
    fireEvent.click(screen.getByRole("button", { name: "Select this page" }));
    expect(screen.getByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
      "checked",
      true,
    );
    const key = crmQueryKeys.agentQueue({ ...agentQueueSearchSchema.parse({}), queue: "runs" });
    await act(async () => {
      client.setQueryData(key, { ...value, canRun: false });
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Select this page" })).toBeNull(),
    );

    expect(screen.queryByRole("button", { name: "Preview 1 selected" })).toBeNull();
    await act(async () => {
      client.setQueryData(key, value);
    });
    await screen.findByRole("button", { name: "Select this page" });

    expect(screen.getByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
      "checked",
      false,
    );
    expect(screen.queryByRole("button", { name: "Preview 1 selected" })).toBeNull();
    client.clear();
  });
  it("does not resurrect an in-flight all-selection after maintenance was revoked and restored", async () => {
    const value = { ...result, totalMatching: 1, nextCursor: null };
    vi.mocked(getAgentQueue).mockResolvedValue(value as never);
    const { client } = mount();
    await screen.findByRole("button", { name: "Select all 1 matching runs" });
    let finish!: (value: unknown) => void;
    vi.mocked(getAgentQueue).mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }) as never,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select all 1 matching runs" }));
    const key = crmQueryKeys.agentQueue({ ...agentQueueSearchSchema.parse({}), queue: "runs" });
    await act(async () => {
      client.setQueryData(key, { ...value, canRun: false });
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Select this page" })).toBeNull(),
    );

    await act(async () => {
      client.setQueryData(key, value);
    });
    await screen.findByRole("button", { name: "Select this page" });

    await act(async () => {
      finish(value);
    });
    expect(screen.getByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
      "checked",
      false,
    );
    expect(screen.queryByRole("button", { name: "Preview 1 selected" })).toBeNull();
    client.clear();
  });
});

// BFF transport doubles exercise React state boundaries; native real-session coverage is recorded separately.
describe("authoritative queue actor lifetime", () => {
  const one = { ...result, totalMatching: 1, nextCursor: null };
  const key = crmQueryKeys.agentQueue({ ...agentQueueSearchSchema.parse({}), queue: "runs" });
  const preview = {
    previewId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    expiresAt: "2026-10-04T12:10:00Z",
    eligibleCount: 1,
    blockedCount: 0,
    items: [{ runId, eligible: true, reasonCode: "ELIGIBLE" }],
  };
  it.each([undefined, null, ""])(
    "requires server actor metadata when canRun is true (%s)",
    async (actorId) => {
      vi.mocked(getAgentQueue).mockResolvedValue({ ...one, actorId } as never);
      const { client } = mount();
      await screen.findByText(/This page: 1 \/ 1/);
      expect(screen.queryByRole("checkbox", { name: "Select run " + runId })).toBeNull();
      expect(screen.queryByRole("region", { name: "Local bulk maintenance" })).toBeNull();
      expect(screen.getByRole("link", { name: "Renamed Draft" })).toBeTruthy();
      client.clear();
    },
  );
  it("clears selected IDs, preview and reason on a new server actor with cached shell context", async () => {
    vi.mocked(getAgentQueue).mockResolvedValue(one as never);
    vi.mocked(previewAgentRecoveryFn).mockResolvedValue(preview);
    const { client } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Select this page" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview 1 selected" }));
    await screen.findByRole("group", { name: "Confirm local recovery" });
    fireEvent.change(screen.getByRole("textbox", { name: "Recovery reason" }), {
      target: { value: "Previous actor reviewed reason" },
    });
    await act(async () => {
      client.setQueryData(key, { ...one, actorId: "queue-actor-b" });
    });
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
        "checked",
        false,
      ),
    );
    expect(screen.queryByRole("group", { name: "Confirm local recovery" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Recovery reason" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select this page" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview 1 selected" }));
    await screen.findByRole("group", { name: "Confirm local recovery" });
    expect(screen.getByRole("textbox", { name: "Recovery reason" })).toHaveProperty("value", "");
    client.clear();
  });
  it("ignores an all-matching response from the previous server actor", async () => {
    vi.mocked(getAgentQueue).mockResolvedValue(one as never);
    const { client } = mount();
    await screen.findByRole("button", { name: "Select all 1 matching runs" });
    let finish!: (value: unknown) => void;
    vi.mocked(getAgentQueue).mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }) as never,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select all 1 matching runs" }));
    await act(async () => {
      client.setQueryData(key, { ...one, actorId: "queue-actor-b" });
    });
    await act(async () => {
      finish(one);
    });
    expect(screen.getByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
      "checked",
      false,
    );
    expect(screen.queryByRole("button", { name: "Preview 1 selected" })).toBeNull();
    client.clear();
  });
  it("refuses all-selection pages from a different actor and refreshes authoritative metadata", async () => {
    vi.mocked(getAgentQueue).mockResolvedValue(one as never);
    const { client } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Select this page" }));
    vi.mocked(getAgentQueue).mockResolvedValueOnce({ ...one, actorId: "queue-actor-b" } as never);
    fireEvent.click(screen.getByRole("button", { name: "Select all 1 matching runs" }));
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
        "checked",
        false,
      ),
    );
    expect(screen.queryByRole("button", { name: "Preview 1 selected" })).toBeNull();
    expect(getAgentQueue).toHaveBeenCalledTimes(3);
    client.clear();
  });
  it("retains selected IDs, preview and reason on same-actor refresh", async () => {
    vi.mocked(getAgentQueue).mockResolvedValue(one as never);
    vi.mocked(previewAgentRecoveryFn).mockResolvedValue(preview);
    const { client } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Select this page" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview 1 selected" }));
    await screen.findByRole("group", { name: "Confirm local recovery" });
    fireEvent.change(screen.getByRole("textbox", { name: "Recovery reason" }), {
      target: { value: "Same actor reviewed reason" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh run queue" }));
    await waitFor(() => expect(getAgentQueue).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.getByRole("group", { name: "Confirm local recovery" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Recovery reason" })).toHaveProperty(
      "value",
      "Same actor reviewed reason",
    );
    client.clear();
  });
});
