// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  triggerLeadAgentMock,
  triggerQuoteAgentMock,
  updateLeadMock,
  getLeadWorkspaceReadMock,
  toastErrorMock,
  toastSuccessMock,
  toastMessageMock,
} = vi.hoisted(() => ({
  triggerLeadAgentMock: vi.fn(),
  triggerQuoteAgentMock: vi.fn(),
  updateLeadMock: vi.fn(),
  getLeadWorkspaceReadMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastMessageMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/leads/$id",
    useLoaderData: vi.fn(),
    useSearch: () => ({}),
  }),
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: toastMessageMock },
}));
vi.mock("@/components/sales", () => ({
  ActivityTimeline: () => null,
  ErrorState: () => null,
  SectionHeader: () => null,
  WorkspaceHeader: () => null,
}));
vi.mock("@/components/status-badge", () => ({ StatusBadge: () => null }));
/**
 * The status control is a Radix Select, which cannot be driven from jsdom without pointer
 * polyfills. It is swapped for the native element it stands in for so the rollback rule
 * below can be exercised; everything that rule touches — value, disabled, onValueChange —
 * is preserved.
 */
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    disabled,
    onValueChange,
    children,
  }: {
    value: string;
    disabled?: boolean;
    onValueChange: (next: string) => void;
    children?: ReactNode;
  }) => (
    <select
      aria-label="Lead status"
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));
vi.mock("@/server-functions/leads", () => ({
  triggerLeadAgent: triggerLeadAgentMock,
  updateLead: updateLeadMock,
}));
vi.mock("@/server-functions/quotes", () => ({ triggerQuoteAgent: triggerQuoteAgentMock }));
vi.mock("@/server-functions/relationship-workspaces", () => ({
  getLeadWorkspaceRead: getLeadWorkspaceReadMock,
}));

import { Route } from "../leads.$id";
import { crmQueryKeys } from "@/lib/query-keys";

const workspaceRead = {
  lead: {
    id: "lead-1",
    contact_id: null,
    account_id: null,
    source_campaign_id: null,
    campaign_member_id: null,
    company_name: "Northstar Retail",
    contact_name: "Ada Chan",
    contact_email: "ada@northstar.example",
    contact_phone: "+852 0000 0000",
    source: "website",
    status: "new",
    assigned_to: null,
    lead_score: 71,
    qualification_data: null,
    enquiry_text: "Needs a retainer",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  },
  activityLogs: [],
  quotes: [],
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

function renderLead() {
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
  return { invalidateQueries };
}

/**
 * Both agent buttons read "Queuing…" while a dispatch is in flight, so they cannot be told
 * apart by name at the moment that matters. They are the only two buttons the page renders
 * (the tabs carry role="tab"), and the panel lists qualify first.
 */
const qualifyButton = () => screen.getAllByRole("button")[0];
const quoteButton = () => screen.getAllByRole("button")[1];

beforeEach(() => {
  vi.clearAllMocks();
  getLeadWorkspaceReadMock.mockResolvedValue(workspaceRead);
  updateLeadMock.mockResolvedValue({});
  vi.mocked(Route.useLoaderData).mockReturnValue(workspaceRead as never);
});

afterEach(cleanup);

describe("Lead detail — agent triggers tell the truth", () => {
  it("reports a failure when the qualification webhook is not configured", async () => {
    // `triggerLeadAgent` resolves `{ triggered: false, reason: "missing_webhook" }` instead
    // of throwing when N8N_QUALIFY_LEAD_WEBHOOK_URL is unset. The success toast used to
    // fire regardless, so the product told the user an agent was working on a lead that no
    // workflow had ever been handed.
    triggerLeadAgentMock.mockResolvedValue({ triggered: false, reason: "missing_webhook" });
    const { invalidateQueries } = renderLead();

    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(qualifyButton().textContent).toContain("Qualify this lead");
    expect(quoteButton().textContent).toContain("Draft a quote with the agent");
    fireEvent.click(qualifyButton());

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "This agent is not connected yet, so nothing was started.",
      ),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
    // Nothing was queued, so there is no new agent run for a refetch to find.
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("reports a failure when the quote webhook is not configured", async () => {
    triggerQuoteAgentMock.mockResolvedValue({ triggered: false, reason: "missing_webhook" });
    const { invalidateQueries } = renderLead();

    fireEvent.click(quoteButton());

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "This agent is not connected yet, so nothing was started.",
      ),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("treats any untriggered result as a failure, not only the reasons it recognises", async () => {
    // A new `triggered: false` branch on the server must not silently become a success
    // here just because its reason string is one this page has never seen.
    triggerQuoteAgentMock.mockResolvedValue({ triggered: false, reason: "rate_limited" });
    renderLead();

    fireEvent.click(quoteButton());

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "The agent could not be started. Nothing has changed.",
      ),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("says an existing run is still going rather than claiming a new one", async () => {
    // `already_running` is not a failure — a run really is in progress — but it is also not
    // a new dispatch, so it must not read as one.
    triggerLeadAgentMock.mockResolvedValue({
      triggered: false,
      reason: "already_running",
      run: { id: "run-1" },
    });
    renderLead();

    fireEvent.click(qualifyButton());

    await waitFor(() => expect(toastMessageMock).toHaveBeenCalled());
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("claims success and refreshes the page only when a run really started", async () => {
    triggerLeadAgentMock.mockResolvedValue({ triggered: true, run: { id: "run-1" } });
    const { invalidateQueries } = renderLead();

    fireEvent.click(qualifyButton());

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith("Qualification agent queued"),
    );
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: crmQueryKeys.leads.detail("lead-1"),
    });
  });

  it("dispatches one run per press, and locks the other agent too", async () => {
    // Both buttons hand the same lead to n8n. A second press mid-dispatch creates a second
    // agent_runs row and a second workflow execution billed against the same lead.
    const request = deferred<{ triggered: boolean }>();
    triggerLeadAgentMock.mockReturnValue(request.promise);
    renderLead();

    fireEvent.click(qualifyButton());

    expect(qualifyButton().hasAttribute("disabled")).toBe(true);
    expect(quoteButton().hasAttribute("disabled")).toBe(true);
    fireEvent.click(qualifyButton());
    fireEvent.click(quoteButton());

    expect(triggerLeadAgentMock).toHaveBeenCalledOnce();
    expect(triggerQuoteAgentMock).not.toHaveBeenCalled();

    await act(async () => {
      request.resolve({ triggered: true });
      await request.promise;
    });
    await waitFor(() => expect(qualifyButton().hasAttribute("disabled")).toBe(false));
  });
});

describe("Lead detail — optimistic status change", () => {
  const statusSelect = () => screen.getByLabelText("Lead status") as HTMLSelectElement;

  it("rolls back to the previous status when the write is rejected", async () => {
    // The Select is set before the await so the page feels instant. Without the rollback a
    // rejected write left it showing a status the database never took, and the only thing
    // that eventually corrected it was the 12-second poll — long enough for someone to act
    // on a lead they believe is qualified.
    updateLeadMock.mockRejectedValue(new Error("Something went wrong. Please try again."));
    renderLead();

    fireEvent.change(statusSelect(), { target: { value: "qualified" } });

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(statusSelect().value).toBe("new");
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("keeps the new status when the write lands", async () => {
    renderLead();

    fireEvent.change(statusSelect(), { target: { value: "qualified" } });

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith("Status updated to Qualified"),
    );
    expect(statusSelect().value).toBe("qualified");
    expect(updateLeadMock).toHaveBeenCalledWith({
      data: { id: "lead-1", updates: { status: "qualified" } },
    });
  });

  it("freezes the control mid-write so two statuses cannot race", async () => {
    // Two overlapping updates land in whichever order Postgres finishes them, and the
    // rollback in the loser's catch would then undo the winner's value.
    const request = deferred<unknown>();
    updateLeadMock.mockReturnValue(request.promise);
    renderLead();

    fireEvent.change(statusSelect(), { target: { value: "qualified" } });

    expect(statusSelect().disabled).toBe(true);
    fireEvent.change(statusSelect(), { target: { value: "won" } });
    expect(updateLeadMock).toHaveBeenCalledOnce();

    await act(async () => {
      request.resolve({});
      await request.promise;
    });
  });
});
