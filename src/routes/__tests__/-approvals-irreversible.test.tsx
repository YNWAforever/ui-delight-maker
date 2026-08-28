// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { SerializableHumanApproval } from "@/lib/serializable";

const decideApprovalMock = vi.hoisted(() => vi.fn());
const approveAndIssueQuoteMock = vi.hoisted(() => vi.fn());
const rejectQuoteMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

const assignApprovalFnMock = vi.hoisted(() => vi.fn());
const getAssignableApproversFnMock = vi.hoisted(() => vi.fn());

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
  getApprovals: vi.fn(),
  decideApproval: decideApprovalMock,
  assignApprovalFn: assignApprovalFnMock,
  getAssignableApproversFn: getAssignableApproversFnMock,
}));
vi.mock("@/server-functions/quotes", () => ({
  approveAndIssueQuote: approveAndIssueQuoteMock,
  rejectQuote: rejectQuoteMock,
}));

import { Route } from "../approvals";

const now = "2026-08-01T09:00:00.000Z";

const approval = (
  overrides: Partial<SerializableHumanApproval> = {},
): SerializableHumanApproval => ({
  id: "ap-1",
  agent_run_id: "run-1",
  approval_type: "discount",
  requested_by: "agent",
  assigned_to: null,
  status: "pending",
  context_data: null,
  context_summary: "Discount of 15% on renewal",
  reviewer_notes: null,
  decided_at: null,
  created_at: now,
  ...overrides,
});

const quoteSend = (overrides: Partial<SerializableHumanApproval> = {}) =>
  approval({
    id: "ap-quote",
    approval_type: "quote_send",
    context_data: { quote_id: "q-1" },
    context_summary: "Send QT-1042 to Northstar",
    ...overrides,
  });

function renderInbox(approvals: SerializableHumanApproval[]) {
  vi.mocked(Route.useLoaderData).mockReturnValue(approvals as never);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["approvals", "list", {}], approvals);
  const Component = Route.options.component as ComponentType;
  return render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
}

/** The inline detail card on the right of the desk, where the decision buttons live. */
const decisionButton = (name: RegExp | string) =>
  screen.getAllByRole("button", { name }).at(-1) as HTMLButtonElement;

beforeEach(() => {
  decideApprovalMock.mockReset().mockResolvedValue(undefined);
  approveAndIssueQuoteMock.mockReset().mockResolvedValue(undefined);
  rejectQuoteMock.mockReset().mockResolvedValue(undefined);
  navigateMock.mockReset();
  getAssignableApproversFnMock.mockReset().mockResolvedValue([
    { id: "profile-1", name: "Ada Wong", email: "ada@fimmick.test" },
    { id: "profile-2", name: "Bea Chan", email: "bea@fimmick.test" },
  ]);
  assignApprovalFnMock
    .mockReset()
    .mockImplementation(async ({ data }: { data: { id: string; assignedTo: string | null } }) =>
      approval({ id: data.id, assigned_to: data.assignedTo }),
    );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Every approval decision is confirmed, and the confirmation names the consequence", () => {
  it("approving a plain request asks first and says the agent cannot be called back", async () => {
    renderInbox([approval()]);

    fireEvent.click(decisionButton(/^Approve$/));

    // A decision writes to an agent run that starts work the moment it is approved. The
    // dialog is the only thing standing between a misclick and that.
    expect(decideApprovalMock).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    const text = dialog.textContent ?? "";
    expect(text).toContain("Approve this request?");
    // The consequence, not a restatement of the question: the agent acts, and nothing undoes it.
    expect(text).toMatch(/proceeds immediately/i);
    expect(text).toMatch(/no undo/i);
  });

  it("approving a quote send says a version is issued and cannot be un-issued", async () => {
    // Different consequence, different sentence. A quote send leaves the building — the
    // shared "There is no undo" would understate what the reader is agreeing to.
    renderInbox([quoteSend()]);

    fireEvent.click(decisionButton(/Approve and issue|^Approve$/));

    const dialog = await screen.findByRole("alertdialog");
    const text = dialog.textContent ?? "";
    expect(text).toMatch(/issues a quote version immediately/i);
    expect(text).toMatch(/no un-issue action/i);
    expect(approveAndIssueQuoteMock).not.toHaveBeenCalled();
  });

  it("rejecting a quote send says the quote has to be revised and resubmitted", async () => {
    renderInbox([quoteSend()]);

    fireEvent.click(decisionButton(/^Reject$/));

    const dialog = await screen.findByRole("alertdialog");
    const text = dialog.textContent ?? "";
    expect(text).toMatch(/no reopen action/i);
    expect(text).toMatch(/revised and submitted for approval again/i);
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

  const reviewerSelect = () => screen.findByRole("combobox", { name: "Assign reviewer (inline)" });

  it("routes a pending approval to the reviewer chosen from the assignable roster", async () => {
    renderInbox([approval()]);

    const trigger = await reviewerSelect();
    expect(trigger.textContent).toContain("Unassigned");

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "Bea Chan" }));

    await waitFor(() =>
      expect(assignApprovalFnMock).toHaveBeenCalledWith({
        data: { id: "ap-1", assignedTo: "profile-2" },
      }),
    );
  });

  it("makes unassigning reachable, not only picking somebody else", async () => {
    // An approval routed to the wrong person needs a way back to the unassigned pool. A
    // picker that can only ever name a different person is a one-way door.
    renderInbox([approval({ assigned_to: "profile-2" })]);

    const trigger = await reviewerSelect();
    // The trigger shows the assignee's id until the roster that names them arrives, which is
    // the honest intermediate state — it never shows a name it has not been told.
    await waitFor(() => expect(trigger.textContent).toContain("Bea Chan"));

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "Unassigned" }));

    await waitFor(() =>
      expect(assignApprovalFnMock).toHaveBeenCalledWith({
        data: { id: "ap-1", assignedTo: null },
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

    fireEvent.click(screen.getAllByRole("checkbox", { name: /Select row ap-1/ })[0]);

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
