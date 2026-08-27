// @vitest-environment jsdom

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Engagement } from "@/lib/types";

const { triggerRiskScoreAgentMock, toastErrorMock, toastSuccessMock, toastMessageMock } =
  vi.hoisted(() => ({
    triggerRiskScoreAgentMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastMessageMock: vi.fn(),
  }));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: toastMessageMock },
}));
vi.mock("@/components/touchpoint-logger", () => ({
  TouchpointLogger: ({ trigger }: { trigger: ReactNode }) => <>{trigger}</>,
}));
vi.mock("@/components/renewals/mark-renewed-ended-dialog", () => ({
  MarkRenewedEndedDialog: () => null,
}));
vi.mock("@/server-functions/engagements", () => ({
  triggerRiskScoreAgent: triggerRiskScoreAgentMock,
  getEngagementsByClient: vi.fn(),
}));
vi.mock("@/server-functions/client-contacts", () => ({ getClientContacts: vi.fn() }));

import { RenewalsPreviewPanel } from "../renewals-preview-panel";

const engagement: Engagement & { client_company_name: string; product_name: string } = {
  id: "eng-1",
  client_id: "client-1",
  product_id: "prod-1",
  owner: null,
  value: 12000,
  billing_period: "monthly",
  start_date: "2026-01-01",
  renewal_date: "2027-01-01",
  status: "active",
  health_score: 70,
  renewal_risk: "medium",
  risk_reasoning: null,
  next_action: null,
  last_touch_at: null,
  end_reason: null,
  lead_id: null,
  quote_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  client_company_name: "Harbour Foods",
  product_name: "Social retainer",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  render(
    <QueryClientProvider client={queryClient}>
      <RenewalsPreviewPanel engagement={engagement} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  return { invalidateQueries };
}

const rescoreButton = () =>
  screen.getByRole("button", { name: /Re-score risk|Scoring…|Retry re-score/ });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("RenewalsPreviewPanel — the risk agent tells the truth", () => {
  it("reports a failure when the renewal risk webhook is not configured", async () => {
    // `triggerRiskScoreAgent` resolves `{ triggered: false, reason: "missing_webhook" }`
    // rather than throwing. The panel must say nothing started — and must not read the
    // name of an environment variable out to a salesperson, which is what the copy it
    // replaced did.
    triggerRiskScoreAgentMock.mockResolvedValue({ triggered: false, reason: "missing_webhook" });
    renderPanel();

    fireEvent.click(rescoreButton());

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "This agent is not connected yet, so nothing was started.",
      ),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock.mock.calls.flat().join(" ")).not.toContain("N8N_");
  });

  it("treats any untriggered result as a failure, not only the reasons it recognises", async () => {
    // This branched on the two reason strings it knew and let everything else fall through
    // to the success toast, so a server-side `triggered: false` this panel had never seen
    // would be announced as a scoring run that had started.
    triggerRiskScoreAgentMock.mockResolvedValue({ triggered: false, reason: "quota_exhausted" });
    const { invalidateQueries } = renderPanel();

    fireEvent.click(rescoreButton());

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "The agent could not be started. Nothing has changed.",
      ),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
    // Nothing was dispatched, so there is no new risk score to refetch.
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("claims a scoring run only when one really started", async () => {
    triggerRiskScoreAgentMock.mockResolvedValue({ triggered: true, run: { id: "run-1" } });
    const { invalidateQueries } = renderPanel();

    fireEvent.click(rescoreButton());

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith("Renewal risk scoring started."),
    );
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalled();
  });

  it("says an existing run is still going instead of claiming a new one", async () => {
    triggerRiskScoreAgentMock.mockResolvedValue({
      triggered: false,
      reason: "already_running",
      run: { id: "run-1" },
    });
    renderPanel();

    fireEvent.click(rescoreButton());

    await waitFor(() => expect(toastMessageMock).toHaveBeenCalled());
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("dispatches one scoring run per press", async () => {
    // Each dispatch creates an agent_runs row and an n8n execution for the same engagement.
    const request = deferred<{ triggered: boolean }>();
    triggerRiskScoreAgentMock.mockReturnValue(request.promise);
    renderPanel();

    fireEvent.click(rescoreButton());

    const inFlight = rescoreButton();
    expect(inFlight.hasAttribute("disabled")).toBe(true);
    fireEvent.click(inFlight);
    fireEvent.click(inFlight);

    expect(triggerRiskScoreAgentMock).toHaveBeenCalledOnce();

    await act(async () => {
      request.resolve({ triggered: true });
      await request.promise;
    });
  });
});
