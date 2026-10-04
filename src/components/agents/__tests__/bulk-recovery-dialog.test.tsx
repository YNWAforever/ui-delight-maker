// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkRecoveryDialog } from "../bulk-recovery-dialog";
import {
  previewAgentRecoveryFn,
  executeAgentRecoveryFn,
  getAgentRecoveryOperationFn,
  resumeAgentRecoveryFn,
} from "@/server-functions/agent-bulk-recovery";
vi.mock("@/server-functions/agent-bulk-recovery", () => ({
  previewAgentRecoveryFn: vi.fn(),
  executeAgentRecoveryFn: vi.fn(),
  getAgentRecoveryOperationFn: vi.fn(),
  resumeAgentRecoveryFn: vi.fn(),
}));
const previewId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  runId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const preview = {
  previewId,
  expiresAt: "2026-10-03T12:10:00Z",
  eligibleCount: 1,
  blockedCount: 1,
  items: [
    { runId, eligible: true, reasonCode: "ELIGIBLE" },
    { runId: "linked", eligible: false, reasonCode: "LINKED_APPROVAL" },
  ],
};
const receipt = {
  operationId: previewId,
  status: "paused",
  completedCount: 1,
  totalCount: 2,
  items: [
    {
      runId,
      status: "succeeded",
      reasonCode: "SUCCEEDED",
      commandReceiptId: "receipt-id",
      retryable: false,
    },
  ],
};
beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(previewAgentRecoveryFn).mockResolvedValue(preview);
  vi.mocked(executeAgentRecoveryFn).mockResolvedValue(receipt as never);
  vi.mocked(getAgentRecoveryOperationFn).mockResolvedValue(receipt as never);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
async function start() {
  render(
    <BulkRecoveryDialog actorId="manager-a" runIds={[runId, "linked"]} onComplete={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview 2 selected" }));
  await screen.findByRole("group", { name: "Confirm local recovery" });
}
describe("reviewed durable local bulk UI", () => {
  it("shows true eligibility, blocks short reason and offers only cancel/expire", async () => {
    await start();
    expect(screen.getByText(/1 eligible \/ 2 selected; 1 blocked/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm 1 local expire" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual([
      "expire",
      "cancel",
    ]);
    expect(screen.getByText(/Only close local run records/)).toBeTruthy();
  });
  it("does not truncate 101 selected or submit an unreviewed operation", () => {
    render(
      <BulkRecoveryDialog
        actorId="manager-a"
        runIds={Array.from({ length: 101 }, () => crypto.randomUUID())}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Preview 101 selected" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/no IDs will be truncated/);
    expect(executeAgentRecoveryFn).not.toHaveBeenCalled();
  });
  it("lost response and reload reuse the exact original key/reason without a new preview", async () => {
    vi.mocked(executeAgentRecoveryFn).mockRejectedValueOnce(new Error("lost response"));
    await start();
    fireEvent.change(screen.getByRole("textbox", { name: "Recovery reason" }), {
      target: { value: "Reviewed local close reason" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm 1 local expire" }));
    await screen.findByRole("alert");
    const original = vi.mocked(executeAgentRecoveryFn).mock.calls[0][0];
    if (!original) throw new Error("Expected a reviewed command before simulating lost response");
    expect(JSON.parse(sessionStorage.getItem("clientops-agent-recovery:manager-a")!)).toEqual(
      original.data,
    );
    cleanup();
    render(<BulkRecoveryDialog actorId="manager-a" runIds={[]} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Read saved operation" }));
    await screen.findByText(/Original reason: Reviewed/);
    fireEvent.click(screen.getByRole("button", { name: "Resume original intent" }));
    await waitFor(() => expect(executeAgentRecoveryFn).toHaveBeenCalledTimes(2));
    expect(vi.mocked(executeAgentRecoveryFn).mock.calls[1][0]).toEqual(original);
    expect(previewAgentRecoveryFn).toHaveBeenCalledTimes(1);
  });
  it("session recovery is keyed by actual actor and foreign actor cannot read another saved intent", async () => {
    sessionStorage.setItem(
      "clientops-agent-recovery:manager-a",
      JSON.stringify({
        previewId,
        idempotencyKey: crypto.randomUUID(),
        reason: "Reviewed local reason",
      }),
    );
    render(<BulkRecoveryDialog actorId="manager-b" runIds={[]} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Read saved operation" }));
    await screen.findByText("No saved operation in this browser session.");
    expect(getAgentRecoveryOperationFn).not.toHaveBeenCalled();
  });
  it("continues the existing operation and terminal receipt clears its saved intent", async () => {
    const completed = { ...receipt, status: "completed", completedCount: 2 };
    vi.mocked(resumeAgentRecoveryFn).mockResolvedValue(completed as never);
    const done = vi.fn();
    sessionStorage.setItem(
      "clientops-agent-recovery:manager-a",
      JSON.stringify({
        previewId,
        idempotencyKey: crypto.randomUUID(),
        reason: "Reviewed local reason",
      }),
    );
    render(<BulkRecoveryDialog actorId="manager-a" runIds={[]} onComplete={done} />);
    fireEvent.click(screen.getByRole("button", { name: "Read saved operation" }));
    await screen.findByText(/Original reason/);
    fireEvent.click(screen.getByRole("button", { name: "Continue local operation" }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(resumeAgentRecoveryFn).toHaveBeenCalledWith({ data: { operationId: previewId } });
    expect(sessionStorage.getItem("clientops-agent-recovery:manager-a")).toBeNull();
  });
  it("cancel preview does not write", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Cancel preview" }));
    expect(screen.queryByRole("group", { name: "Confirm local recovery" })).toBeNull();
    expect(executeAgentRecoveryFn).not.toHaveBeenCalled();
  });
  it("changing selection while preview is pending cannot confirm stale IDs", async () => {
    let resolve!: (value: typeof preview) => void;
    vi.mocked(previewAgentRecoveryFn).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const mounted = render(
      <BulkRecoveryDialog actorId="manager-a" runIds={[runId]} onComplete={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview 1 selected" }));
    mounted.rerender(
      <BulkRecoveryDialog actorId="manager-a" runIds={["changed"]} onComplete={vi.fn()} />,
    );
    resolve(preview);
    await screen.findByText("Selection changed. Preview the current selection again.");
    expect(screen.queryByRole("group", { name: "Confirm local recovery" })).toBeNull();
    expect(executeAgentRecoveryFn).not.toHaveBeenCalled();
  });
});

// Actor props come from the authenticated route context, which can refresh without a page remount.
// These are component lifecycle contracts; transport doubles do not certify authentication.
describe("bulk maintenance actor lifetime", () => {
  it("drops another actor's reviewed preview and reason on a context change", async () => {
    const props = { runIds: [runId], onComplete: vi.fn() };
    const view = render(<BulkRecoveryDialog {...props} actorId="manager-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Preview 1 selected" }));
    await screen.findByRole("group", { name: "Confirm local recovery" });
    fireEvent.change(screen.getByRole("textbox", { name: "Recovery reason" }), {
      target: { value: "Actor A private reviewed reason" },
    });
    view.rerender(<BulkRecoveryDialog {...props} actorId="manager-b" />);
    expect(screen.queryByRole("group", { name: "Confirm local recovery" })).toBeNull();
    expect(screen.queryByDisplayValue("Actor A private reviewed reason")).toBeNull();
    expect(executeAgentRecoveryFn).not.toHaveBeenCalled();
  });

  it("keeps uncertain intents under their original actor and restores only that actor's intent", async () => {
    vi.mocked(executeAgentRecoveryFn).mockRejectedValueOnce(new Error("response lost"));
    const props = { runIds: [runId], onComplete: vi.fn() };
    const view = render(<BulkRecoveryDialog {...props} actorId="manager-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Preview 1 selected" }));
    await screen.findByRole("group", { name: "Confirm local recovery" });
    fireEvent.change(screen.getByRole("textbox", { name: "Recovery reason" }), {
      target: { value: "Actor A durable reviewed reason" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm 1 local expire" }));
    await screen.findByRole("alert");
    const original = vi.mocked(executeAgentRecoveryFn).mock.calls[0][0];
    expect(original).toBeDefined();
    view.rerender(<BulkRecoveryDialog {...props} actorId="manager-b" />);
    expect(screen.queryByText(/Actor A durable reviewed reason/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Resume original intent" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Read saved operation" }));
    await screen.findByText("No saved operation in this browser session.");
    expect(getAgentRecoveryOperationFn).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("clientops-agent-recovery:manager-b")).toBeNull();
    expect(JSON.parse(sessionStorage.getItem("clientops-agent-recovery:manager-a")!)).toEqual(
      original!.data,
    );
    view.rerender(<BulkRecoveryDialog {...props} actorId="manager-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Read saved operation" }));
    await screen.findByText(/Original reason: Actor A durable reviewed reason/);
    fireEvent.click(screen.getByRole("button", { name: "Resume original intent" }));
    await waitFor(() => expect(executeAgentRecoveryFn).toHaveBeenCalledTimes(2));
    expect(vi.mocked(executeAgentRecoveryFn).mock.calls[1][0]).toEqual(original);
    expect(previewAgentRecoveryFn).toHaveBeenCalledTimes(1);
  });

  it("ignores a pending previous actor preview even when selected IDs are unchanged", async () => {
    let finish!: (value: typeof preview) => void;
    vi.mocked(previewAgentRecoveryFn).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const props = { runIds: [runId], onComplete: vi.fn() };
    const view = render(<BulkRecoveryDialog {...props} actorId="manager-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Preview 1 selected" }));
    view.rerender(<BulkRecoveryDialog {...props} actorId="manager-b" />);
    await act(async () => {
      finish(preview);
    });
    await waitFor(() => expect(screen.queryByText("Checking local records…")).toBeNull());
    expect(screen.queryByRole("group", { name: "Confirm local recovery" })).toBeNull();
    expect(screen.getByRole("button", { name: "Preview 1 selected" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(executeAgentRecoveryFn).not.toHaveBeenCalled();
  });

  it("does not expose a late previous actor receipt or clear that actor's saved intent", async () => {
    let finish!: (value: typeof receipt) => void;
    vi.mocked(executeAgentRecoveryFn).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }) as never,
    );
    const done = vi.fn(),
      props = { runIds: [runId], onComplete: done };
    const view = render(<BulkRecoveryDialog {...props} actorId="manager-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Preview 1 selected" }));
    await screen.findByRole("group", { name: "Confirm local recovery" });
    fireEvent.change(screen.getByRole("textbox", { name: "Recovery reason" }), {
      target: { value: "Actor A pending reviewed reason" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm 1 local expire" }));
    const original = sessionStorage.getItem("clientops-agent-recovery:manager-a");
    expect(original).not.toBeNull();
    view.rerender(<BulkRecoveryDialog {...props} actorId="manager-b" />);
    await act(async () => {
      finish({ ...receipt, status: "completed", completedCount: 2 });
    });
    expect(done).not.toHaveBeenCalled();
    expect(screen.queryByText(/completed: 2 \/ 2 processed/)).toBeNull();
    expect(screen.queryByText(/receipt-id/)).toBeNull();
    expect(sessionStorage.getItem("clientops-agent-recovery:manager-a")).toBe(original);
    expect(sessionStorage.getItem("clientops-agent-recovery:manager-b")).toBeNull();
    expect(screen.getByRole("button", { name: "Preview 1 selected" })).toHaveProperty(
      "disabled",
      false,
    );
  });
});
