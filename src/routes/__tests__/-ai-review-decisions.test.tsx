// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmQueryKeys } from "@/lib/query-keys";
import type { SerializableHumanApproval } from "@/lib/serializable";

/**
 * The five things `/ai-review` got wrong about deciding an AI action.
 *
 * 1. **The row vanished.** The read is `where status = 'pending'`, and the handler spliced the
 *    decided row out of the cache on top of that, so the item a reviewer just acted on
 *    disappeared mid-click with nothing to confirm what happened to it.
 * 2. **`/agents` kept showing the run as waiting.** `decideApproval` also completes the agent
 *    run parked on the approval, and this route invalidated only its own queue.
 * 3. **A quote send was decided differently here than on `/approvals`.** A bare
 *    `decideApproval` closes the approval and leaves the quote unissued — approved on one
 *    screen, not approved on the other.
 * 4. **Failures printed whatever the server threw**, including Postgres text.
 * 5. **The buttons were live for four roles that cannot use them.**
 */

const {
  decideApprovalMock,
  getApprovalsMock,
  approveAndIssueQuoteMock,
  rejectQuoteMock,
  routerInvalidateMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  decideApprovalMock: vi.fn(),
  getApprovalsMock: vi.fn(),
  approveAndIssueQuoteMock: vi.fn(),
  rejectQuoteMock: vi.fn(),
  routerInvalidateMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/ai-review",
    useLoaderData: vi.fn(),
    useRouteContext: vi.fn(),
  }),
  useRouter: () => ({ invalidate: routerInvalidateMock }),
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock, message: vi.fn() },
}));

vi.mock("@/server-functions/agent-runs", () => ({ getAiReviewRead: vi.fn() }));
vi.mock("@/server-functions/approvals", () => ({
  getApprovals: getApprovalsMock,
  decideApproval: decideApprovalMock,
}));
vi.mock("@/server-functions/quotes", () => ({
  approveAndIssueQuote: approveAndIssueQuoteMock,
  rejectQuote: rejectQuoteMock,
}));

import { Route } from "../ai-review";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const approval = (
  overrides: Partial<SerializableHumanApproval> = {},
): SerializableHumanApproval => ({
  id: "ap-1",
  agent_run_id: "run-1",
  approval_type: "message_send",
  requested_by: "Reply Draft Agent",
  assigned_to: null,
  status: "pending",
  context_data: { lead_id: "lead-1", confidence_score: 0.82, risk_notes: ["Unverified budget"] },
  context_summary: "Reply drafted for Northstar",
  reviewer_notes: null,
  decided_at: null,
  created_at: "2026-08-02T09:00:00.000Z",
  ...overrides,
});

const secondApproval = approval({
  id: "ap-2",
  approval_type: "discount",
  requested_by: "Quote Draft Agent",
  context_data: { lead_id: "lead-2" },
  context_summary: "15% discount on renewal",
  created_at: "2026-08-01T09:00:00.000Z",
});

const quoteSend = approval({
  id: "ap-quote",
  approval_type: "quote_send",
  requested_by: "Quote Draft Agent",
  context_data: { lead_id: "lead-1", quote_id: "q-1", confidence_score: 0.9 },
  context_summary: "Send QT-1042 to Northstar",
});

const run = {
  id: "run-1",
  agent_name: "Reply Draft Agent",
  trigger_type: "webhook",
  output_summary: "Drafted a reply covering pricing and timeline",
  status: "waiting_approval",
  duration_ms: 1200,
  tokens_used: 900,
  confidence_score: 0.82,
  human_review_required: true,
  created_at: "2026-08-02T09:00:00.000Z",
};

function renderQueue(
  approvals: SerializableHumanApproval[],
  options: { role?: string; runs?: unknown[] } = {},
) {
  vi.mocked(Route.useLoaderData).mockReturnValue({
    approvals,
    humanReviewRuns: options.runs ?? [run],
  } as never);
  vi.mocked(Route.useRouteContext).mockReturnValue({
    profile: { id: "user-1", role: options.role ?? "manager" },
  } as never);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  const Component = Route.options.component as ComponentType;

  render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );

  return { queryClient, invalidateQueries };
}

/** The decision buttons live in the detail card; the queue rows carry the same words. */
const decisionButton = (name: RegExp | string) =>
  screen.getAllByRole("button", { name }).at(-1) as HTMLButtonElement;

async function confirmDecision(trigger: RegExp | string, action: RegExp | string) {
  fireEvent.click(decisionButton(trigger));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: action }));
}

/** Row order as the table renders it — the ordering the queue promises to preserve. */
const tableRowText = () =>
  [...document.querySelectorAll("tbody tr")].map((row) => row.textContent ?? "");

beforeEach(() => {
  decideApprovalMock.mockReset().mockResolvedValue(undefined);
  approveAndIssueQuoteMock.mockReset().mockResolvedValue(undefined);
  rejectQuoteMock.mockReset().mockResolvedValue(undefined);
  getApprovalsMock.mockReset().mockResolvedValue([]);
  routerInvalidateMock.mockReset().mockResolvedValue(undefined);
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a decided item keeps its place and the queue moves on", () => {
  it("updates the row's status in place instead of removing it", async () => {
    renderQueue([approval(), secondApproval]);

    expect(tableRowText()[0]).toContain("Message send");
    expect(tableRowText()[0]).toContain("Waiting approval");

    await confirmDecision(/^Approve$/, /^Approve$/);
    await waitFor(() => expect(decideApprovalMock).toHaveBeenCalledTimes(1));

    // Still two rows, still in the same order, and the first now carries its new status.
    await waitFor(() => expect(tableRowText()[0]).toContain("Approved"));
    expect(tableRowText()).toHaveLength(2);
    expect(tableRowText()[0]).toContain("Message send");
    expect(tableRowText()[1]).toContain("Discount");
  });

  it("moves the selection to the next pending item in the same ordering", async () => {
    renderQueue([approval(), secondApproval]);

    await confirmDecision(/^Approve$/, /^Approve$/);

    // The detail side now shows the next pending request, ready to decide. Identified by its
    // own "Proposed action" sentence, which is keyed on the approval type.
    await waitFor(() =>
      expect(screen.getByText(/No pricing change is applied automatically/)).toBeTruthy(),
    );
    expect(screen.queryByText(/ClientOps does not send the message/)).toBeNull();
  });

  it("shows the decided item as final rather than offering to decide it again", async () => {
    renderQueue([approval()]);

    await confirmDecision(/^Approve$/, /^Approve$/);
    await waitFor(() => expect(decideApprovalMock).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.getByText(/cannot be undone from ClientOps/i)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /^Reject$/ })).toBeNull();
  });
});

describe("one decision at a time", () => {
  it("disables every decision while a write is in flight and cannot submit twice", async () => {
    const pending = deferred<void>();
    decideApprovalMock.mockReturnValue(pending.promise);
    renderQueue([approval()]);

    await confirmDecision(/^Approve$/, /^Approve$/);
    await waitFor(() => expect(decideApprovalMock).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(decisionButton(/Recording…/).disabled).toBe(true));
    expect(decisionButton(/^Reject$/).disabled).toBe(true);
    expect(decisionButton(/Request changes/).disabled).toBe(true);

    // Even forced, a second click cannot re-enter the handler.
    fireEvent.click(decisionButton(/Recording…/));
    expect(decideApprovalMock).toHaveBeenCalledTimes(1);

    pending.resolve();
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledTimes(1));
  });
});

describe("a quote send is decided the same way it is on /approvals", () => {
  it("approves and issues the quote instead of only closing the approval", async () => {
    // `approveAndIssueQuote` requires `quotes.issue`, which the manager baseline does not
    // hold — the advisory disables Approve for a manager on a quote send, which is the
    // server's own rule made visible.
    renderQueue([quoteSend], { role: "admin" });

    await confirmDecision(/Approve/, /Approve and issue/);

    await waitFor(() =>
      expect(approveAndIssueQuoteMock).toHaveBeenCalledWith({
        data: { id: "q-1", approvalId: "ap-quote" },
      }),
    );
    // The bare decision would have left the quote in pending_approval.
    expect(decideApprovalMock).not.toHaveBeenCalled();
  });

  it("rejects through the quote path so the quote itself is marked rejected", async () => {
    renderQueue([quoteSend], { role: "admin" });

    await confirmDecision(/^Reject$/, /^Reject$/);

    await waitFor(() =>
      expect(rejectQuoteMock).toHaveBeenCalledWith({
        data: { id: "q-1", approvalId: "ap-quote" },
      }),
    );
    expect(decideApprovalMock).not.toHaveBeenCalled();
  });
});

describe("the write's aftermath", () => {
  it("refreshes the approval, the approval lists, this queue and every agent surface", async () => {
    const { invalidateQueries } = renderQueue([approval()]);

    await confirmDecision(/^Approve$/, /^Approve$/);
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledTimes(1));

    const keys = invalidateQueries.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(crmQueryKeys.approvals.detail("ap-1")));
    expect(keys).toContain(JSON.stringify(crmQueryKeys.approvals.lists()));
    expect(keys).toContain(JSON.stringify(crmQueryKeys.aiReview.all()));
    // `decideApproval` completes the parked agent run, so /agents was stale without this.
    expect(keys).toContain(JSON.stringify(crmQueryKeys.agents.all()));
  });

  it("never puts a driver message on screen when the write fails", async () => {
    decideApprovalMock.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "agent_runs_active_idx"'),
    );
    renderQueue([approval()]);

    await confirmDecision(/^Approve$/, /^Approve$/);

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    const message = String(toastErrorMock.mock.calls[0][0]);
    expect(message).not.toContain("agent_runs_active_idx");
    expect(message).not.toMatch(/duplicate key/i);
    expect(message).toBe("Something went wrong. Please try again.");
    expect(toastSuccessMock).not.toHaveBeenCalled();

    // The row is untouched: nothing is marked decided on a write that did not land.
    expect(tableRowText()[0]).toContain("Waiting approval");
  });
});

describe("the decision controls are honest about who may use them", () => {
  it("also flags a capability the decision itself needs, not only approvals.decide", () => {
    // A quote send is approved through `approveAndIssueQuote`, which requires `quotes.issue`.
    // The manager baseline holds `approvals.decide` and `quotes.approve` but not that, so
    // Approve is unavailable while Reject is not — a distinction the old screen never made.
    renderQueue([quoteSend], { role: "manager" });

    expect(decisionButton(/^Approve$/).disabled).toBe(true);
    expect(decisionButton(/^Reject$/).disabled).toBe(false);
    expect(screen.getByText(/Issuing quotes is not part of your role/)).toBeTruthy();
  });

  it("disables them with a reason for a role whose baseline cannot decide", () => {
    // ROLE_GRANTS gives `sales` approvals.view but not approvals.decide, so this role used to
    // load the queue, click Approve and get a red toast instead of an honest control.
    renderQueue([approval()], { role: "sales" });

    expect(decisionButton(/^Approve$/).disabled).toBe(true);
    expect(decisionButton(/^Reject$/).disabled).toBe(true);
    expect(decisionButton(/Request changes/).disabled).toBe(true);

    const reason = screen.getByText(/not part of your role/i);
    expect(decisionButton(/^Approve$/).getAttribute("aria-describedby")).toBe(reason.id);
    expect(decideApprovalMock).not.toHaveBeenCalled();
  });

  it("leaves them live when the profile is unavailable, because the server decides", () => {
    vi.mocked(Route.useRouteContext).mockReturnValue({ profile: null } as never);
    renderQueue([approval()], { role: "manager" });
    vi.mocked(Route.useRouteContext).mockReturnValue({ profile: null } as never);

    expect(decisionButton(/^Approve$/).disabled).toBe(false);
  });
});

describe("an empty queue", () => {
  it("says no work needs attention and when something was last reviewed", async () => {
    getApprovalsMock.mockResolvedValue([
      approval({ id: "old-1", status: "approved", decided_at: "2026-07-30T11:30:00.000Z" }),
      approval({ id: "old-2", status: "rejected", decided_at: "2026-08-01T08:15:00.000Z" }),
    ]);
    renderQueue([], { runs: [] });

    expect(screen.getByText("No work needs attention")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Last reviewed 01 Aug 2026, 08:15/)).toBeTruthy());
  });

  it("says nothing about a last review when nothing has been decided", async () => {
    getApprovalsMock.mockResolvedValue([]);
    renderQueue([], { runs: [] });

    await waitFor(() => expect(screen.getByText(/Nothing has been reviewed yet/)).toBeTruthy());
  });
});

describe("the raw agent payload", () => {
  it("is kept behind an Advanced disclosure rather than shown by default", () => {
    renderQueue([approval()]);

    const disclosure = screen.getByText("Raw agent payload").closest("details");
    expect(disclosure).not.toBeNull();
    expect((disclosure as HTMLDetailsElement).open).toBe(false);
    // The JSON is inside the disclosure, not on the page beside the agent's own words.
    expect(disclosure?.querySelector("pre")?.textContent).toContain("confidence_score");
    // The agent's own words are on the page (in the detail panel and in the flagged-run
    // list), while its JSON is not.
    expect(screen.getAllByText(/Drafted a reply covering pricing and timeline/).length).toBe(2);
  });
});
