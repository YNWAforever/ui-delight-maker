// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminError } from "@/lib/admin/errors";
import type { SerializableHumanApproval } from "@/lib/serializable";

const decideApprovalMock = vi.hoisted(() => vi.fn());
const getApprovalsPageMock = vi.hoisted(() => vi.fn());
const getApprovalDetailFnMock = vi.hoisted(() => vi.fn());
const approveQuoteMock = vi.hoisted(() => vi.fn());
const rejectQuoteMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const getBulkResultMock = vi.hoisted(() => vi.fn());
const commitBulkMock = vi.hoisted(() => vi.fn());
const resumeBulkMock = vi.hoisted(() => vi.fn());
const previewBulkMock = vi.hoisted(() => vi.fn());

vi.mock("@/server-functions/bulk-operations", () => ({
  getBulkResultFn: getBulkResultMock,
  commitBulkFn: commitBulkMock,
  resumeBulkFn: resumeBulkMock,
  previewBulkFn: previewBulkMock,
}));

const assignApprovalFnMock = vi.hoisted(() => vi.fn());
const listAssignableProfilesFnMock = vi.hoisted(() => vi.fn());
const resolveAssignableProfileFnMock = vi.hoisted(() => vi.fn());
const getMessageHandoffFnMock = vi.hoisted(() => vi.fn());
const claimApprovalFnMock = vi.hoisted(() => vi.fn());
const recordManualMessageSentFnMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/approvals",
    useLoaderData: vi.fn(),
    useSearch: () => ({ type: "all" }),
  }),
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: vi.fn(() => Promise.resolve()) }),
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock("@/server-functions/approvals", () => ({
  getApprovalsPage: getApprovalsPageMock,
  getApprovalDetailFn: getApprovalDetailFnMock,
  decideApproval: decideApprovalMock,
  assignApprovalFn: assignApprovalFnMock,
  getMessageHandoffFn: getMessageHandoffFnMock,
  claimApprovalFn: claimApprovalFnMock,
  recordManualMessageSentFn: recordManualMessageSentFnMock,
}));
vi.mock("@/server-functions/assignable-profiles", () => ({
  listAssignableProfilesFn: listAssignableProfilesFnMock,
  resolveAssignableProfileFn: resolveAssignableProfileFnMock,
}));

vi.mock("@/server-functions/quotes", () => ({
  approveQuote: approveQuoteMock,
  rejectQuote: rejectQuoteMock,
}));

import { Route } from "../approvals";

const now = "2026-08-01T09:00:00.000Z";

type ApprovalView = SerializableHumanApproval & {
  can_decide?: boolean;
  can_request_changes?: boolean;
  can_assign?: boolean;
  can_claim?: boolean;
};

const approval = (overrides: Partial<ApprovalView> = {}): ApprovalView => ({
  can_decide: true,
  can_request_changes: true,
  can_assign: true,
  can_claim: true,
  id: "ap-1",
  agent_run_id: "run-1",
  approval_type: "discount",
  requested_by: "agent",
  assigned_to: null,
  status: "pending",
  row_version: 0,
  superseded_by: null,
  context_data: null,
  context_summary: "Discount of 15% on renewal",
  reviewer_notes: null,
  decided_at: null,
  created_at: now,
  ...overrides,
});

const messageSend = (overrides: Partial<ApprovalView> = {}) =>
  approval({
    approval_type: "message_send",
    context_summary: "Reply draft for customer",
    ...overrides,
  });

const quoteSend = (overrides: Partial<SerializableHumanApproval> = {}) =>
  approval({
    id: "ap-quote",
    approval_type: "quote_send",
    context_data: { quote_id: "22222222-2222-4222-8222-222222222222" },
    context_summary: "Send QT-1042 to Northstar",
    ...overrides,
  });

function renderInbox(approvals: SerializableHumanApproval[]) {
  const toList = (record: SerializableHumanApproval) => {
    const { context_data, ...list } = record;
    const quote_id =
      context_data &&
      typeof context_data === "object" &&
      !Array.isArray(context_data) &&
      "quote_id" in context_data &&
      typeof context_data.quote_id === "string"
        ? context_data.quote_id
        : null;
    return { ...list, quote_id };
  };
  const pending = approvals.filter(
    (item) => item.status === "pending" || item.status === "escalated",
  );
  const history = approvals.filter(
    (item) => item.status !== "pending" && item.status !== "escalated",
  );
  const makePage = (items: SerializableHumanApproval[]) => ({
    items: items.map(toList),
    nextCursor: null,
    total: items.length,
    counts: {
      pending: items.filter((item) => item.status === "pending").length,
      escalated: items.filter((item) => item.status === "escalated").length,
      quoteSends: items.filter(
        (item) => item.status === "pending" && item.approval_type === "quote_send",
      ).length,
    },
  });
  getApprovalsPageMock.mockImplementation(({ data }: { data: { group: string } }) =>
    Promise.resolve(makePage(data.group === "pending" ? pending : history)),
  );
  getApprovalDetailFnMock.mockImplementation(({ data }: { data: { id: string } }) =>
    Promise.resolve(approvals.find((item) => item.id === data.id)),
  );
  vi.mocked(Route.useLoaderData).mockReturnValue(makePage(pending) as never);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(
    ["approvals", "list", { group: "pending", type: "all" }],
    makePage(pending),
  );
  queryClient.setQueryData(
    ["approvals", "list", { group: "history", type: "all" }],
    makePage(history),
  );
  const Component = Route.options.component as ComponentType;
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

/** The inline detail card on the right of the desk, where the decision buttons live. */
const decisionButton = (name: RegExp | string) =>
  screen.getAllByRole("button", { name }).at(-1) as HTMLButtonElement;

beforeEach(() => {
  sessionStorage.clear();
  getBulkResultMock.mockReset();
  commitBulkMock.mockReset();
  resumeBulkMock.mockReset();
  previewBulkMock.mockReset();
  decideApprovalMock.mockReset().mockImplementation(async ({ data }) =>
    approval({
      id: data.id,
      status: data.decision,
      row_version: data.expectedVersion + 1,
      reviewer_notes: data.notes ?? null,
      decided_at: now,
    }),
  );
  getApprovalsPageMock.mockReset();
  getApprovalDetailFnMock.mockReset();
  approveQuoteMock.mockReset().mockResolvedValue({
    id: "22222222-2222-4222-8222-222222222222",
    status: "approved",
    row_version: 999,
  });
  rejectQuoteMock.mockReset().mockResolvedValue({
    id: "22222222-2222-4222-8222-222222222222",
    status: "rejected",
    row_version: 999,
  });
  navigateMock.mockReset();
  getMessageHandoffFnMock.mockReset().mockResolvedValue({
    approvalId: "ap-1",
    can_record_manual_send: true,
    draftMessage: "Draft only",
    handoff: { handoff_status: "awaiting_manual_send", sent_reference: null },
  });
  claimApprovalFnMock
    .mockReset()
    .mockResolvedValue(approval({ assigned_to: "profile-1", row_version: 1 }));
  recordManualMessageSentFnMock
    .mockReset()
    .mockResolvedValue({ handoff_status: "manual_send_recorded", sent_reference: "ref" });
  listAssignableProfilesFnMock.mockReset().mockImplementation(async () => ({
    items: [
      { id: "profile-1", displayName: "Ada Wong", isEligible: true, reason: null },
      { id: "profile-2", displayName: "Bea Chan", isEligible: true, reason: null },
    ],
    nextCursor: null,
    total: 2,
  }));
  resolveAssignableProfileFnMock
    .mockReset()
    .mockImplementation(async ({ data }: { data: { id: string } }) => ({
      id: data.id,
      displayName: data.id === "profile-2" ? "Bea Chan" : "Ada Wong",
      isEligible: true,
      reason: null,
    }));
  assignApprovalFnMock
    .mockReset()
    .mockImplementation(async ({ data }: { data: { id: string; assignedTo: string | null } }) =>
      approval({ id: data.id, assigned_to: data.assignedTo, row_version: 1 }),
    );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("The Approval Desk at laptop width", () => {
  it("lists each request in two columns, with its waiting time under the request", () => {
    // UX-11: four columns in two fifths of a 1280 screen wrapped the request to six lines.
    renderInbox([approval()]);

    const table = screen.getByRole("table", { name: "Approvals waiting on a human decision" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim())
      .filter(Boolean);
    expect(headers).toEqual(["Request", "Status"]);
    expect(
      within(table).getByRole("button", { name: /Discount of 15% on renewal/ }).textContent,
    ).toMatch(/Raised /);
  });

  it("takes focus to the open record when a request is chosen", async () => {
    // UX-40: a keyboard user tabbed past every row's controls (131 stops) to reach a decision.
    renderInbox([approval()]);

    const table = screen.getByRole("table", { name: "Approvals waiting on a human decision" });
    await userEvent.click(
      within(table).getByRole("button", { name: /Discount of 15% on renewal/ }),
    );

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 2, name: "Discount" }),
      ),
    );
    expect(screen.getByRole("region", { name: "Discount" })).toBeTruthy();
  });
});

describe("Every approval decision is confirmed, and the confirmation names the consequence", () => {
  it("approving a plain request asks first and says the agent cannot be called back", async () => {
    renderInbox([approval()]);

    fireEvent.click(decisionButton(/^Approve$/));

    // The confirmation must describe the stored decision without inventing a downstream action.
    expect(decideApprovalMock).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    const text = dialog.textContent ?? "";
    expect(text).toContain("Approve this request?");
    // The consequence, not a restatement of the question: the agent acts, and nothing undoes it.
    expect(text).toMatch(/records the decision/i);
    expect(text).not.toMatch(/proceeds immediately/i);
  });

  it("approving a message draft says it awaits human sending", async () => {
    renderInbox([messageSend()]);
    fireEvent.click(decisionButton(/^Approve$/));
    const text = (await screen.findByRole("alertdialog")).textContent ?? "";
    expect(text).toMatch(/draft.*manual handoff/i);
    expect(text).toMatch(/ClientOps does not send or confirm delivery/i);
    expect(text).not.toMatch(/agent proceeds immediately/i);
  });

  it("offers an unassigned review claim through the scoped command", async () => {
    renderInbox([approval()]);
    fireEvent.click(decisionButton(/Claim for review/));
    await waitFor(() => expect(claimApprovalFnMock).toHaveBeenCalledTimes(1));
    expect(claimApprovalFnMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: "ap-1", expectedVersion: 0 }),
    });
  });

  it("shows an approved draft with manual send controls and no delivery claim", async () => {
    renderInbox([messageSend({ status: "approved", assigned_to: "profile-1", decided_at: now })]);
    expect((await screen.findAllByText("Draft only")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Copy approved draft" }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByRole("button", { name: "Record manual send" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no platform delivery receipt/i).length).toBeGreaterThan(0);
  });

  it("approving a quote send confirms approval without claiming issuance", async () => {
    renderInbox([quoteSend()]);

    fireEvent.click(decisionButton(/^Approve$/));

    const dialog = await screen.findByRole("alertdialog");
    const text = dialog.textContent ?? "";
    expect(text).toMatch(/marks the quote approved/i);
    expect(text).toMatch(/separate authorized action/i);
    expect(text).not.toMatch(/issues a quote version immediately/i);
    expect(approveQuoteMock).not.toHaveBeenCalled();
  });

  it("rejecting a quote send says the quote has to be revised and resubmitted", async () => {
    renderInbox([quoteSend()]);

    fireEvent.click(decisionButton(/^Reject$/));

    const dialog = await screen.findByRole("alertdialog");
    const text = dialog.textContent ?? "";
    expect(text).toMatch(/Reopening it means revising/i);
    expect(text).toMatch(/requesting approval again/i);
    expect(rejectQuoteMock).not.toHaveBeenCalled();
  });

  it("requesting changes says the agent run stays parked", async () => {
    renderInbox([approval()]);

    fireEvent.click(decisionButton(/Request changes/));

    const dialog = await screen.findByRole("alertdialog");
    const text = dialog.textContent ?? "";
    expect(text).toMatch(/stays parked/i);
    expect(text).toMatch(/new approval is raised/i);
  });

  it("only decides once the confirming control is pressed, and not on cancel", async () => {
    renderInbox([approval()]);

    fireEvent.click(decisionButton(/^Approve$/));
    let dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(decideApprovalMock).not.toHaveBeenCalled();

    fireEvent.click(decisionButton(/^Approve$/));
    dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(decideApprovalMock).toHaveBeenCalledTimes(1));
  });

  it("keeps the decided approval on screen afterwards, saying it cannot be undone", async () => {
    // The other half of the same promise. Once the dialog's warning has come true the record
    // has to stay put and keep saying so — vanishing the instant the write lands reads as
    // "did that work?", and leaves the reader hunting for an undo that does not exist.
    renderInbox([approval()]);

    fireEvent.click(screen.getAllByRole("button", { name: /Discount of 15% on renewal/ })[0]);
    fireEvent.click(decisionButton(/^Approve$/));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));

    expect(await screen.findByText(/This decision cannot be undone from ClientOps/i)).toBeTruthy();
  });
});

describe("Assigning a reviewer", () => {
  /**
   * Radix Select is a listbox built from divs, and jsdom implements none of the pointer-capture
   * surface it opens against. These four are the whole shim.
   */
  beforeAll(() => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
  });

  const reviewerSelect = () =>
    screen.findByRole("combobox", { name: "Assign reviewer (inline) search" });

  it("routes a pending approval to the reviewer chosen from the assignable roster", async () => {
    renderInbox([approval()]);

    const trigger = await reviewerSelect();
    expect(screen.getAllByText(/Selected: Unassigned/).length).toBeGreaterThan(0);

    fireEvent.change(trigger, { target: { value: "Bea" } });
    await userEvent.click((await screen.findAllByRole("button", { name: "Bea Chan" }))[0]);

    await waitFor(() =>
      expect(assignApprovalFnMock).toHaveBeenCalledWith({
        data: { id: "ap-1", assignedTo: "profile-2", expectedVersion: 0 },
      }),
    );
  });

  it("makes unassigning reachable, not only picking somebody else", async () => {
    // An approval routed to the wrong person needs a way back to the unassigned pool. A
    // picker that can only ever name a different person is a one-way door.
    renderInbox([approval({ assigned_to: "profile-2" })]);

    const trigger = await reviewerSelect();
    await waitFor(() =>
      expect(screen.getAllByText(/Selected: Bea Chan/).length).toBeGreaterThan(0),
    );
    expect(trigger).toBeTruthy();

    await userEvent.click(screen.getAllByRole("button", { name: "Unassigned" })[0]);

    await waitFor(() =>
      expect(assignApprovalFnMock).toHaveBeenCalledWith({
        data: { id: "ap-1", assignedTo: null, expectedVersion: 0 },
      }),
    );
  });

  it("removes the control once the approval is decided rather than disabling it", async () => {
    // `assignApproval` refuses to reassign anything that is not pending, so routing a decided
    // approval is not unavailable — it is meaningless. A disabled control would imply it might
    // come back.
    renderInbox([approval()]);
    expect(await reviewerSelect()).toBeTruthy();

    // Select the row explicitly: a decided approval leaves `pending`, and only an explicit
    // selection keeps it on screen afterwards to be asserted against.
    fireEvent.click(screen.getAllByRole("button", { name: /Discount of 15% on renewal/ })[0]);
    fireEvent.click(decisionButton(/^Approve$/));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));

    await screen.findByText(/This decision cannot be undone from ClientOps/i);
    expect(screen.queryByRole("combobox", { name: /Assign reviewer/ })).toBeNull();
  });

  it("no longer offers the dead assign button in the bulk bar", async () => {
    // What stood there toasted success for a write that never happened, against a hardcoded
    // roster of five fixture users. The live control is per-approval, where the current
    // assignee is visible and clearing it is possible.
    renderInbox([approval(), approval({ id: "ap-2" })]);

    fireEvent.click(screen.getAllByRole("checkbox", { name: /Discount of 15% on renewal/ })[0]);

    expect(screen.queryByRole("button", { name: /Assign reviewer/ })).toBeNull();
    expect(
      screen.queryByText(/Not available yet — approvals are decided by whoever opens them/i),
    ).toBeNull();
    // The bulk actions beside it are untouched.
    expect(
      (screen.getAllByRole("button", { name: /^Approve$/ })[0] as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe("Server-evaluated approval action boundaries", () => {
  it.each([false, undefined])("omits writes and selection when metadata is %s", async (flag) => {
    renderInbox([
      approval({ can_decide: flag, can_assign: flag, can_claim: flag, can_request_changes: flag }),
    ]);
    await screen.findAllByText("Discount of 15% on renewal");
    await waitFor(() => expect(getApprovalDetailFnMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Request changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Claim for review" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /Assign reviewer/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Reviewer notes or decision reason" })).toBeNull();
    expect(screen.getAllByText("No reviewer notes were recorded.").length).toBeGreaterThan(0);
    expect(decideApprovalMock).not.toHaveBeenCalled();
    expect(assignApprovalFnMock).not.toHaveBeenCalled();
  });

  it("keeps a scoped claim reachable without offering a direct decision", async () => {
    renderInbox([
      approval({
        can_decide: false,
        can_assign: false,
        can_request_changes: false,
        can_claim: true,
      }),
    ]);
    const claim = await screen.findByRole("button", { name: "Claim for review" });
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /Assign reviewer/ })).toBeNull();
    fireEvent.click(claim);
    await waitFor(() => expect(claimApprovalFnMock).toHaveBeenCalled());
  });

  it("allows selection only on independently permitted rows", async () => {
    renderInbox([
      approval(),
      approval({
        id: "ap-denied",
        context_summary: "Denied row",
        can_decide: false,
        can_assign: false,
        can_claim: false,
        can_request_changes: false,
      }),
    ]);
    const denied = screen.getAllByRole("checkbox", { name: /Denied row/ });
    expect(denied.every((element) => (element as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(denied[0]);
    expect(screen.queryByText("1 selected")).toBeNull();
    fireEvent.click(screen.getAllByRole("checkbox", { name: /Discount of 15% on renewal/ })[0]);
    expect(screen.getByText("1 selected")).toBeTruthy();
  });

  it("shows approved draft read access while omitting an unauthorized manual record", async () => {
    getMessageHandoffFnMock.mockResolvedValue({
      approvalId: "ap-1",
      can_record_manual_send: false,
      draftMessage: "Draft only",
      handoff: { handoff_status: "awaiting_manual_send", sent_reference: null },
    });
    renderInbox([
      messageSend({
        status: "approved",
        can_decide: false,
        can_assign: false,
        can_claim: false,
        can_request_changes: false,
      }),
    ]);
    expect(await screen.findByRole("button", { name: "Copy approved draft" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record manual send" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Manual send reference" })).toBeNull();
    expect(recordManualMessageSentFnMock).not.toHaveBeenCalled();
  });
});

const savedBulkCommit = {
  kind: "pending_commit",
  operationId: "owned-operation",
  previewToken: "original-preview",
  idempotencyKey: "original-key",
};
const ownedBulkReceipt = {
  operationId: "owned-operation",
  state: "paused" as const,
  processed: 1,
  total: 2,
  remainingIds: ["pending-item"],
  results: [{ id: "succeeded-item", status: "succeeded" as const, retryable: false }],
};

describe("Approval durable bulk receipt recovery", () => {
  it("keeps and retries the original receipt with no selected rows, then resumes the exact saved commit key", async () => {
    const saved = JSON.stringify(savedBulkCommit);
    sessionStorage.setItem("clientops:bulk:approvals", saved);
    getBulkResultMock
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValue(ownedBulkReceipt);
    commitBulkMock.mockResolvedValue({
      ...ownedBulkReceipt,
      state: "completed",
      processed: 2,
      results: [
        ...ownedBulkReceipt.results,
        { id: "pending-item", status: "forbidden", retryable: false },
      ],
    });
    renderInbox([]);
    const retry = await screen.findByRole("button", { name: "Retry loading result" });
    expect(sessionStorage.getItem("clientops:bulk:approvals")).toBe(saved);
    expect(commitBulkMock).not.toHaveBeenCalled();
    expect(previewBulkMock).not.toHaveBeenCalled();
    fireEvent.click(retry);
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    await waitFor(() =>
      expect(commitBulkMock).toHaveBeenCalledWith({
        data: { previewToken: "original-preview", idempotencyKey: "original-key" },
      }),
    );
    expect(resumeBulkMock).not.toHaveBeenCalled();
    expect(previewBulkMock).not.toHaveBeenCalled();
    await screen.findByText(/2 of 2 processed; 1 succeeded; 1 need review/);
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(screen.getByRole("button", { name: "Download failures" })).toBeTruthy();
    expect(sessionStorage.getItem("clientops:bulk:approvals")).toBe("owned-operation");
  });
  it("keeps an owned receipt readable when no row can be changed and can dismiss it without a command", async () => {
    sessionStorage.setItem("clientops:bulk:approvals", JSON.stringify(savedBulkCommit));
    getBulkResultMock.mockResolvedValue({ ...ownedBulkReceipt, state: "completed", processed: 2 });
    renderInbox([]);
    await screen.findByText(/2 of 2 processed/);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(sessionStorage.getItem("clientops:bulk:approvals")).toBeNull();
    expect(commitBulkMock).not.toHaveBeenCalled();
    expect(previewBulkMock).not.toHaveBeenCalled();
  });
  it("discards an inaccessible receipt without exposing its details or offering a write", async () => {
    sessionStorage.setItem("clientops:bulk:approvals", "another-actor-operation");
    getBulkResultMock.mockRejectedValue(new Error("Bulk operation owner access denied"));
    renderInbox([]);
    await waitFor(() => expect(sessionStorage.getItem("clientops:bulk:approvals")).toBeNull());
    expect(screen.queryByRole("button", { name: "Retry loading result" })).toBeNull();
    expect(document.body.textContent).not.toContain("another-actor-operation");
    expect(commitBulkMock).not.toHaveBeenCalled();
    expect(previewBulkMock).not.toHaveBeenCalled();
  });
});

describe("Approval Review integration contract", () => {
  it("quote reject passes frozen nonzero version, key and notes", async () => {
    renderInbox([quoteSend({ row_version: 7 })]);
    fireEvent.change(
      screen.getAllByRole("textbox", { name: "Reviewer notes or decision reason" })[0],
      { target: { value: " checked " } },
    );
    fireEvent.click(decisionButton(/^Reject$/));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(rejectQuoteMock).toHaveBeenCalledWith({
        data: {
          id: "22222222-2222-4222-8222-222222222222",
          approvalId: "ap-quote",
          expectedVersion: 7,
          idempotencyKey: expect.any(String),
          notes: "checked",
        },
      }),
    );
    expect(decideApprovalMock).not.toHaveBeenCalled();
  });
  it("blocks missing version and permits a real version after refreshing", async () => {
    const row = approval({ row_version: undefined as unknown as number });
    const { queryClient } = renderInbox([row]);
    fireEvent.click(decisionButton(/^Approve$/));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(decideApprovalMock).not.toHaveBeenCalled();
    const { toast } = await import("sonner");
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/current version/));
    row.row_version = 7;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<{ items: ApprovalView[] }>([
          "approvals",
          "list",
          { group: "pending", type: "all" },
        ])?.items[0].row_version,
      ).toBe(7),
    );
    fireEvent.click(decisionButton(/^Approve$/));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(decideApprovalMock).toHaveBeenCalledWith({
        data: expect.objectContaining({ expectedVersion: 7 }),
      }),
    );
  });
  it("optimistically updates only the selected row and preserves server counts", async () => {
    let release!: (value: ApprovalView) => void;
    decideApprovalMock.mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const { queryClient } = renderInbox([
      approval({ row_version: 7 }),
      approval({ id: "ap-2", context_summary: "Other row" }),
    ]);
    const key = ["approvals", "list", { group: "pending", type: "all" }];
    const before = queryClient.getQueryData<{ items: ApprovalView[]; counts: unknown }>(key)!;
    fireEvent.click(screen.getAllByRole("button", { name: /Discount of 15% on renewal/ })[0]);
    fireEvent.click(decisionButton(/^Approve$/));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(decideApprovalMock).toHaveBeenCalledTimes(1));
    const during = queryClient.getQueryData<typeof before>(key)!;
    expect(during.items[0].status).toBe("approved");
    expect(during.items[1]).toEqual(before.items[1]);
    expect(during.counts).toEqual(before.counts);
    release(approval({ status: "approved", row_version: 8, decided_at: now }));
    await waitFor(() => expect(screen.getAllByText(/cannot be undone/).length).toBeGreaterThan(0));
  });
  it("denied writes preserve a newer assigned row from refetch", async () => {
    let reject!: (error: unknown) => void;
    decideApprovalMock.mockImplementation(
      () =>
        new Promise((_r, j) => {
          reject = j;
        }),
    );
    const { queryClient } = renderInbox([approval({ row_version: 7 })]);
    const key = ["approvals", "list", { group: "pending", type: "all" }];
    fireEvent.click(decisionButton(/^Approve$/));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(decideApprovalMock).toHaveBeenCalledTimes(1));
    const page = queryClient.getQueryData<{ items: ApprovalView[] }>(key)!;
    const newer = {
      ...page.items[0],
      status: "pending" as const,
      row_version: 8,
      assigned_to: "profile-2",
    };
    queryClient.setQueryData(key, { ...page, items: [newer] });
    getApprovalDetailFnMock.mockResolvedValue(newer);
    getApprovalsPageMock.mockResolvedValue({ ...page, items: [newer] });
    reject(new AdminError("STALE_ADMIN_STATE", "Refresh this approval."));
    await waitFor(() =>
      expect(queryClient.getQueryData<typeof page>(key)?.items[0]).toEqual(newer),
    );
    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(decideApprovalMock).toHaveBeenCalledTimes(1);
  });
});
