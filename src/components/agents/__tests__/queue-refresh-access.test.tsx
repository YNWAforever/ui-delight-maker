// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentQueueSearchSchema } from "@/lib/agent-queue-input";
import { getAgentQueue } from "@/server-functions/agent-runs";
import {
  previewAgentRecoveryFn,
  executeAgentRecoveryFn,
  getAgentRecoveryOperationFn,
} from "@/server-functions/agent-bulk-recovery";
import { RunQueuePanel } from "../run-queue-panel";
vi.mock("@/server-functions/agent-runs", () => ({ getAgentQueue: vi.fn() }));
vi.mock("@/server-functions/agent-bulk-recovery", () => ({
  previewAgentRecoveryFn: vi.fn(),
  executeAgentRecoveryFn: vi.fn(),
  getAgentRecoveryOperationFn: vi.fn(),
  resumeAgentRecoveryFn: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/agents/draft">{children}</a>,
}));
const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const previewId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const one = {
  queue: "runs",
  actorId: "current-server-actor",
  canRun: true,
  items: [
    {
      id: runId,
      agent_name: "Prior authorized run",
      workflow_type: "draft_reply",
      status: "running",
      created_at: "2026-10-04T00:00:00Z",
      is_demo: true,
      subject_restricted: false,
      tokens_used: null,
    },
  ],
  totalMatching: 1,
  nextCursor: null,
  asOf: "2026-10-04T00:10:00Z",
  limit: 25,
};
const preview = {
  previewId,
  expiresAt: "2026-10-04T00:20:00Z",
  eligibleCount: 1,
  blockedCount: 0,
  items: [{ runId, eligible: true, reasonCode: "ELIGIBLE" }],
};
const clients: QueryClient[] = [];
beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(getAgentQueue).mockResolvedValue(one as never);
  vi.mocked(previewAgentRecoveryFn).mockResolvedValue(preview);
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.resetAllMocks();
});
const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <RunQueuePanel
        filters={agentQueueSearchSchema.parse({})}
        onChange={vi.fn()}
        actorId="cached-shell-actor"
      />
    </QueryClientProvider>,
  );
};
async function selectAndPreview() {
  fireEvent.click(await screen.findByRole("button", { name: "Select this page" }));
  fireEvent.click(screen.getByRole("button", { name: "Preview 1 selected" }));
  await screen.findByRole("group", { name: "Confirm local recovery" });
}
async function failedRefresh(status = 403) {
  vi.mocked(getAgentQueue).mockRejectedValueOnce(
    Object.assign(new Error("private server reason"), { status }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh run queue" }));
  await screen.findByText("Run queue did not load. Refresh or clear its filters.");
}
// Actual React/Query state; BFF transport doubles only. Real seven-session native evidence is separate.
describe("queue refresh failure after an authorized cached read", () => {
  it.each([401, 403, 500])(
    "hides cached rows and maintenance after status%s without claiming empty",
    async (status) => {
      mount();
      await selectAndPreview();
      await failedRefresh(status);
      expect(screen.queryByRole("link", { name: "Prior authorized run" })).toBeNull();
      expect(screen.queryByRole("checkbox", { name: "Select run " + runId })).toBeNull();
      expect(screen.queryByRole("region", { name: "Local bulk maintenance" })).toBeNull();
      expect(screen.queryByRole("group", { name: "Confirm local recovery" })).toBeNull();
      expect(screen.queryByText(/No accessible runs match/)).toBeNull();
      expect(screen.queryByText("private server reason")).toBeNull();
      expect(screen.getByRole("button", { name: "Refresh run queue" })).toBeTruthy();
    },
  );
  it("a successful same-actor retry restores reads without old selection or preview", async () => {
    mount();
    await selectAndPreview();
    await failedRefresh();
    fireEvent.click(screen.getByRole("button", { name: "Refresh run queue" }));
    await waitFor(() => expect(getAgentQueue).toHaveBeenCalledTimes(3));
    expect(await screen.findByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
      "checked",
      false,
    );
    expect(screen.queryByRole("group", { name: "Confirm local recovery" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Preview 1 selected" })).toBeNull();
  });
  it("a delayed all-selection response cannot revive selection after a failed refresh and retry", async () => {
    mount();
    await screen.findByRole("button", { name: "Select all 1 matching runs" });
    let finish!: (value: unknown) => void;
    vi.mocked(getAgentQueue).mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }) as never,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select all 1 matching runs" }));
    await failedRefresh();
    fireEvent.click(screen.getByRole("button", { name: "Refresh run queue" }));
    await waitFor(() => expect(getAgentQueue).toHaveBeenCalledTimes(4));
    await act(async () => {
      finish(one);
    });
    expect(await screen.findByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
      "checked",
      false,
    );
    expect(screen.queryByRole("button", { name: "Preview 1 selected" })).toBeNull();
  });
  it("preserves uncertain original intent for the returning owner without another execute", async () => {
    vi.mocked(executeAgentRecoveryFn).mockRejectedValueOnce(new Error("lost response"));
    vi.mocked(getAgentRecoveryOperationFn).mockResolvedValue({
      operationId: previewId,
      status: "paused",
      completedCount: 0,
      totalCount: 1,
      items: [],
    } as never);
    mount();
    await selectAndPreview();
    const reason = "Original owner reviewed reason";
    fireEvent.change(screen.getByRole("textbox", { name: "Recovery reason" }), {
      target: { value: reason },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm 1 local expire" }));
    await screen.findByText(/The result is unconfirmed/);
    const key = "clientops-agent-recovery:" + one.actorId,
      saved = sessionStorage.getItem(key);
    expect(saved).not.toBeNull();
    await failedRefresh();
    expect(sessionStorage.getItem(key)).toBe(saved);
    expect(screen.queryByRole("region", { name: "Local bulk maintenance" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh run queue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Read saved operation" }));
    await screen.findByText("Operation " + previewId + ". Original reason: " + reason);
    expect(sessionStorage.getItem(key)).toBe(saved);
    expect(getAgentRecoveryOperationFn).toHaveBeenCalledWith({ data: { operationId: previewId } });
    expect(executeAgentRecoveryFn).toHaveBeenCalledTimes(1);
  });
  it("keeps authorized selection and preview during an in-flight same-actor refresh", async () => {
    mount();
    await selectAndPreview();
    let finish!: (value: unknown) => void;
    vi.mocked(getAgentQueue).mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }) as never,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh run queue" }));
    expect(screen.getByRole("link", { name: "Prior authorized run" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.getByRole("group", { name: "Confirm local recovery" })).toBeTruthy();
    await act(async () => {
      finish(one);
    });
    expect(screen.getByRole("checkbox", { name: "Select run " + runId })).toHaveProperty(
      "checked",
      true,
    );
  });
});
