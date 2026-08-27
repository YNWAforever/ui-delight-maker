// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SerializableHumanApproval } from "@/lib/serializable";

const decideApprovalMock = vi.hoisted(() => vi.fn());
const approveAndIssueQuoteMock = vi.hoisted(() => vi.fn());
const rejectQuoteMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

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

describe("Assign reviewer is unavailable, and says so where it stands", () => {
  it("is disabled and carries a visible reason rather than a dead button", () => {
    // `human_approvals.assigned_to` has no writer — src/server-functions/approvals.ts exports
    // only getApprovals and decideApproval. The control that stood here toasted success for a
    // write that never happened. Disabled is correct; disabled and silent is not.
    renderInbox([approval(), approval({ id: "ap-2" })]);

    fireEvent.click(screen.getAllByRole("checkbox", { name: /Select row ap-1/ })[0]);

    const assign = screen.getAllByRole("button", {
      name: /Assign reviewer/,
    })[0] as HTMLButtonElement;
    expect(assign.disabled).toBe(true);

    // The reason has to be readable, not only implied by the greyed pixels.
    expect(
      screen.getByText(/Not available yet — approvals are decided by whoever opens them/i),
    ).toBeTruthy();
  });

  it("keeps the bulk actions beside it live, so the reason is about this control only", () => {
    // Guards against "the whole bar is disabled" passing the assertion above.
    renderInbox([approval(), approval({ id: "ap-2" })]);

    fireEvent.click(screen.getAllByRole("checkbox", { name: /Select row ap-1/ })[0]);

    const bulkApprove = screen.getAllByRole("button", {
      name: /^Approve$/,
    })[0] as HTMLButtonElement;
    expect(bulkApprove.disabled).toBe(false);
  });
});
