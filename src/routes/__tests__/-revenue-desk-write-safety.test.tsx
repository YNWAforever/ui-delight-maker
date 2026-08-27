// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Lead, LeadStatus } from "@/lib/types";

const {
  moveLeadStageMock,
  triggerLeadAgentMock,
  triggerLeadReplyDraftMock,
  triggerQuoteAgentMock,
  createTaskMock,
  navigateMock,
  routerInvalidateMock,
  toastErrorMock,
  toastSuccessMock,
  toastMessageMock,
} = vi.hoisted(() => ({
  moveLeadStageMock: vi.fn(),
  triggerLeadAgentMock: vi.fn(),
  triggerLeadReplyDraftMock: vi.fn(),
  triggerQuoteAgentMock: vi.fn(),
  createTaskMock: vi.fn(),
  navigateMock: vi.fn(),
  routerInvalidateMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastMessageMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/",
    useLoaderData: vi.fn(),
    useSearch: () => ({}),
  }),
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: routerInvalidateMock }),
}));
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: toastMessageMock },
}));
vi.mock("@/components/sales", () => ({
  EmptyWorkspaceState: () => null,
  MetricStrip: () => null,
  SectionHeader: () => null,
  WorkspaceHeader: () => null,
}));
vi.mock("@/components/pipeline/pipeline-toolbar", () => ({ PipelineToolbar: () => null }));
/**
 * The won-conversion dialog has its own tests; here it only needs to say whether the route
 * opened it, and for which lead.
 */
vi.mock("@/components/pipeline/won-conversion-dialog", () => ({
  WonConversionDialog: ({ lead }: { lead: Lead | null }) =>
    lead ? <div>conversion dialog for {lead.id}</div> : null,
}));
/**
 * Stands in for the board and preview panel. The two surfaces it replaces disable their
 * controls from the three `pending*LeadId` props; this one deliberately does not, so a
 * second press really re-enters the route handler and the route's own in-flight guard is
 * what the assertions below are testing. The pending ids are printed instead, because
 * publishing them is the route's half of that contract.
 */
vi.mock("@/components/dashboard/dashboard-insights", () => ({
  DashboardInsights: ({
    leads,
    onMoveLead,
    onQualify,
    onDraftReply,
    onDraftQuote,
    onCreateTask,
    pendingMoveLeadId,
    pendingAiLeadId,
    pendingTaskLeadId,
  }: {
    leads: Lead[];
    onMoveLead: (lead: Lead, status: LeadStatus) => void;
    onQualify: (lead: Lead) => void;
    onDraftReply: (lead: Lead) => void;
    onDraftQuote: (lead: Lead) => void;
    onCreateTask: (lead: Lead) => void;
    pendingMoveLeadId?: string | null;
    pendingAiLeadId?: string | null;
    pendingTaskLeadId?: string | null;
  }) => (
    <div>
      <button onClick={() => onQualify(leads[0])}>Qualify</button>
      <button onClick={() => onDraftReply(leads[0])}>Draft reply</button>
      <button onClick={() => onDraftQuote(leads[0])}>Draft quote</button>
      <button onClick={() => onCreateTask(leads[0])}>Task</button>
      <button onClick={() => onMoveLead(leads[0], "qualified")}>Move to qualified</button>
      <button onClick={() => onMoveLead(leads[0], "won")}>Move to won</button>
      <p data-testid="pending-move">{pendingMoveLeadId ?? "none"}</p>
      <p data-testid="pending-ai">{pendingAiLeadId ?? "none"}</p>
      <p data-testid="pending-task">{pendingTaskLeadId ?? "none"}</p>
    </div>
  ),
}));
vi.mock("@/lib/admin-ux-search", () => ({
  pipelineFiltersFromSearch: () => ({}),
  pipelineSearchFromFilters: () => ({}),
  revenueDeskSearchSchema: {},
}));
vi.mock("@/lib/business-date", () => ({ getBusinessDateKey: () => "2026-08-27" }));
vi.mock("@/lib/pipeline", () => ({
  filterPipelineLeads: ({ leads }: { leads: Lead[] }) => leads,
  getPipelineSummary: () => ({ overdue: 0, dueToday: 0, highScore: 0 }),
}));
vi.mock("@/lib/sales-workspace", () => ({ buildRevenueActions: () => [] }));
vi.mock("@/server-functions/dashboard", () => ({ getDashboardRead: vi.fn() }));
vi.mock("@/server-functions/leads", () => ({
  moveLeadStage: moveLeadStageMock,
  triggerLeadAgent: triggerLeadAgentMock,
  triggerLeadReplyDraft: triggerLeadReplyDraftMock,
}));
vi.mock("@/server-functions/quotes", () => ({ triggerQuoteAgent: triggerQuoteAgentMock }));
vi.mock("@/server-functions/tasks", () => ({ createTask: createTaskMock }));

import { Route } from "../index";

const lead: Lead = {
  id: "lead-1",
  contact_id: null,
  account_id: null,
  source_campaign_id: null,
  campaign_member_id: null,
  company_name: "Northstar Retail",
  contact_name: "Ada Chan",
  contact_email: "ada@northstar.example",
  contact_phone: null,
  source: "website",
  status: "approved",
  assigned_to: null,
  lead_score: 82,
  qualification_data: null,
  enquiry_text: "Needs a retainer",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

const loaderData = {
  leads: [lead],
  quotes: [],
  tasks: [],
  approvals: [],
  agentRuns: [],
  activityLogs: [],
  products: [],
  pipelineTotals: {
    activeQuoteValue: 0,
    openLeads: 1,
    openTasks: 0,
    pendingApprovals: 0,
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderDesk() {
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
  // The insights panel is lazy-loaded behind a Suspense boundary.
  await screen.findByRole("button", { name: "Qualify" });
  return { invalidateQueries };
}

const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  vi.clearAllMocks();
  moveLeadStageMock.mockResolvedValue({});
  createTaskMock.mockResolvedValue({});
  vi.mocked(Route.useLoaderData).mockReturnValue(loaderData as never);
});

afterEach(cleanup);

describe("Revenue Desk — agent triggers tell the truth", () => {
  const agents = [
    ["Qualify", triggerLeadAgentMock, "Qualification agent queued"],
    ["Draft reply", triggerLeadReplyDraftMock, "Reply draft agent queued"],
    ["Draft quote", triggerQuoteAgentMock, "Quote agent queued"],
  ] as const;

  it.each(agents)(
    "%s reports a failure when the webhook is not configured",
    async (label, trigger) => {
      // Each of these server functions resolves `{ triggered: false, reason:
      // "missing_webhook" }` rather than throwing when its N8N_*_WEBHOOK_URL is unset.
      // Every one of the three used to toast success anyway — the board then showed a
      // "queued" claim for a workflow that was never handed the lead, and the only way to
      // discover it was that no result ever arrived.
      trigger.mockResolvedValue({ triggered: false, reason: "missing_webhook" });
      const { invalidateQueries } = await renderDesk();

      fireEvent.click(button(label));

      await waitFor(() =>
        expect(toastErrorMock).toHaveBeenCalledWith(
          "This agent is not connected yet, so nothing was started.",
        ),
      );
      expect(toastSuccessMock).not.toHaveBeenCalled();
      // Nothing started, so there is nothing new for a refetch of the board to pick up.
      expect(invalidateQueries).not.toHaveBeenCalled();
      expect(routerInvalidateMock).not.toHaveBeenCalled();
    },
  );

  it.each(agents)(
    "%s claims success only when a run really started",
    async (label, trigger, message) => {
      trigger.mockResolvedValue({ triggered: true, run: { id: "run-1" } });
      await renderDesk();

      fireEvent.click(button(label));

      await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith(message));
      expect(toastErrorMock).not.toHaveBeenCalled();
    },
  );

  it("treats an unrecognised untriggered reason as a failure", async () => {
    // The board must not fall through to success just because the server grew a
    // `triggered: false` branch this route has never heard of.
    triggerLeadAgentMock.mockResolvedValue({ triggered: false, reason: "quota_exhausted" });
    await renderDesk();

    fireEvent.click(button("Qualify"));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "The agent could not be started. Nothing has changed.",
      ),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("says an existing run is still going instead of claiming a second one", async () => {
    triggerLeadReplyDraftMock.mockResolvedValue({
      triggered: false,
      reason: "already_running",
      run: { id: "run-1" },
    });
    await renderDesk();

    fireEvent.click(button("Draft reply"));

    await waitFor(() => expect(toastMessageMock).toHaveBeenCalled());
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});

describe("Revenue Desk — one write per press", () => {
  it("dispatches a single agent run even when all three buttons are pressed", async () => {
    // The three AI actions share one in-flight lead id: they all create an agent_runs row
    // for the same lead, and firing a second before the first answers bills a second n8n
    // execution. The route must also publish that id so the board can grey the controls.
    const request = deferred<{ triggered: boolean }>();
    triggerLeadAgentMock.mockReturnValue(request.promise);
    await renderDesk();

    fireEvent.click(button("Qualify"));

    expect(screen.getByTestId("pending-ai").textContent).toBe("lead-1");
    fireEvent.click(button("Qualify"));
    fireEvent.click(button("Draft reply"));
    fireEvent.click(button("Draft quote"));

    expect(triggerLeadAgentMock).toHaveBeenCalledOnce();
    expect(triggerLeadReplyDraftMock).not.toHaveBeenCalled();
    expect(triggerQuoteAgentMock).not.toHaveBeenCalled();

    await act(async () => {
      request.resolve({ triggered: true });
      await request.promise;
    });
    await waitFor(() => expect(screen.getByTestId("pending-ai").textContent).toBe("none"));
  });

  it("creates one follow-up task per press", async () => {
    // A second press produced a second identical "Follow up with …" task, due the same
    // day, which someone then had to close by hand.
    const request = deferred<unknown>();
    createTaskMock.mockReturnValue(request.promise);
    await renderDesk();

    fireEvent.click(button("Task"));

    expect(screen.getByTestId("pending-task").textContent).toBe("lead-1");
    fireEvent.click(button("Task"));
    fireEvent.click(button("Task"));

    expect(createTaskMock).toHaveBeenCalledOnce();

    await act(async () => {
      request.resolve({});
      await request.promise;
    });
    await waitFor(() => expect(screen.getByTestId("pending-task").textContent).toBe("none"));
  });

  it("moves a lead one stage at a time", async () => {
    // Two overlapping stage writes land in an order Postgres decides, and each one appends
    // its own activity log row, so the timeline ends up recording a move that never
    // happened.
    const request = deferred<unknown>();
    moveLeadStageMock.mockReturnValue(request.promise);
    await renderDesk();

    fireEvent.click(button("Move to qualified"));

    expect(screen.getByTestId("pending-move").textContent).toBe("lead-1");
    fireEvent.click(button("Move to qualified"));

    expect(moveLeadStageMock).toHaveBeenCalledOnce();

    await act(async () => {
      request.resolve({});
      await request.promise;
    });
    await waitFor(() => expect(screen.getByTestId("pending-move").textContent).toBe("none"));
  });
});

describe("Revenue Desk — the won/lost stage dialog", () => {
  const openDialog = async () => {
    fireEvent.click(button("Move to won"));
    const reason = await screen.findByLabelText("Reason");
    fireEvent.change(reason, { target: { value: "Client accepted the proposal" } });
    return reason;
  };

  it("writes the move once however many times confirm is pressed", async () => {
    // A won move writes the status, the reason on the timeline, and opens the conversion
    // dialog behind it. Two of them means two timeline entries for one decision.
    const request = deferred<unknown>();
    moveLeadStageMock.mockReturnValue(request.promise);
    await renderDesk();
    await openDialog();

    fireEvent.click(button("Confirm move"));

    const inFlight = button("Moving…");
    expect(inFlight.hasAttribute("disabled")).toBe(true);
    fireEvent.click(inFlight);
    fireEvent.click(inFlight);

    expect(moveLeadStageMock).toHaveBeenCalledOnce();
    expect(moveLeadStageMock).toHaveBeenCalledWith({
      data: { id: "lead-1", status: "won", reason: "Client accepted the proposal" },
    });

    await act(async () => {
      request.resolve({});
      await request.promise;
    });
  });

  it("keeps the dialog and the typed reason when the move fails", async () => {
    // The dialog closing on a rejected write is indistinguishable from a successful move:
    // panel gone, board unchanged. The reason has to survive too, or it is retyped.
    moveLeadStageMock.mockRejectedValue(new Error("Something went wrong. Please try again."));
    await renderDesk();
    await openDialog();

    fireEvent.click(button("Confirm move"));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm stage change")).toBeTruthy();
    expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toBe(
      "Client accepted the proposal",
    );
    // A failed move must not start the conversion: the lead is not won.
    expect(screen.queryByText("conversion dialog for lead-1")).toBeNull();
    // And confirm has to come back, or the move can never be retried.
    expect(button("Confirm move").hasAttribute("disabled")).toBe(false);
  });

  it("opens the conversion dialog only after the won move has landed", async () => {
    // The client and engagement records are created from that dialog. Opening it
    // optimistically would let someone convert a lead whose stage write had just failed.
    const request = deferred<unknown>();
    moveLeadStageMock.mockReturnValue(request.promise);
    await renderDesk();
    await openDialog();

    fireEvent.click(button("Confirm move"));
    expect(screen.queryByText("conversion dialog for lead-1")).toBeNull();

    await act(async () => {
      request.resolve({});
      await request.promise;
    });

    await waitFor(() => expect(screen.getByText("conversion dialog for lead-1")).toBeTruthy());
    expect(toastSuccessMock).toHaveBeenCalledWith("Northstar Retail moved to Won");
  });
});
