// @vitest-environment jsdom

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmQueryKeys } from "@/lib/query-keys";
import type { Engagement } from "@/lib/types";

/**
 * The half of the `/renewals` repaint fix that lives in this panel.
 *
 * `src/routes/__tests__/-renewals-board-refresh.test.tsx` asserts the route end: when the
 * panel reports a change, the board refreshes its query and re-runs only its own loader.
 * It reaches that by mocking this component away, so on its own it proves nothing about
 * whether the panel ever reports anything.
 *
 * This is the other end. Two of the four writes on this route do not live in this file at
 * all — "Mark renewed"/"Mark ended" are in `MarkRenewedEndedDialog` and "Log touchpoint"
 * is in `TouchpointLogger` — and both were part of the original defect: a child that
 * invalidated a query key could not move a board rendered from a router loader snapshot.
 * If a future edit drops `await onChanged?.()` from either callback the board goes stale
 * again in exactly the way it used to, with a success toast over an unchanged row, and
 * nothing else in the suite notices.
 *
 * The children are stood in for by buttons that fire the callback the real ones invoke
 * only after their write resolved — that contract is asserted directly in
 * `mark-renewed-ended-dialog.test.tsx` and `touchpoint-logger.test.tsx`, which both check
 * the callback is *not* fired when the write fails.
 */

const { toastMocks } = vi.hoisted(() => ({
  toastMocks: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMocks }));

vi.mock("@/components/touchpoint-logger", () => ({
  TouchpointLogger: ({
    trigger,
    onLogged,
  }: {
    trigger: ReactNode;
    onLogged?: () => void | Promise<void>;
  }) => (
    <>
      {trigger}
      <button type="button" onClick={() => void onLogged?.()}>
        touchpoint written
      </button>
    </>
  ),
}));

vi.mock("@/components/renewals/mark-renewed-ended-dialog", () => ({
  MarkRenewedEndedDialog: ({ onDone }: { onDone: () => void | Promise<void> }) => (
    <button type="button" onClick={() => void onDone()}>
      lifecycle write settled
    </button>
  ),
}));

vi.mock("@/server-functions/engagements", () => ({
  triggerRiskScoreAgent: vi.fn(),
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

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  const onChanged = vi.fn(() => Promise.resolve());
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <RenewalsPreviewPanel engagement={engagement} onClose={onClose} onChanged={onChanged} />
    </QueryClientProvider>,
  );
  return { invalidateQueries, onChanged, onClose };
}

/** Every key handed to `invalidateQueries`, serialised for containment checks. */
const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map(([argument]) => JSON.stringify((argument as { queryKey: unknown }).queryKey));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("the renewals preview panel tells its host that something changed", () => {
  it("reports a logged touchpoint to the host, not only to the query cache", async () => {
    const { invalidateQueries, onChanged } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "touchpoint written" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    // The key the board's own query hangs off. Without it the children's refresh reaches
    // nothing the reader is looking at.
    expect(invalidatedKeys(invalidateQueries)).toContain(
      JSON.stringify(crmQueryKeys.renewals.lists()),
    );
  });

  it("reports a renewal or an ending to the host, and only then closes itself", async () => {
    const { invalidateQueries, onChanged, onClose } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "lifecycle write settled" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(invalidatedKeys(invalidateQueries)).toContain(
      JSON.stringify(crmQueryKeys.renewals.lists()),
    );
    // Closing before the refresh would return the reader to a board still showing the row
    // as active, which is the bug in its original form.
    expect(onChanged.mock.invocationCallOrder[0]).toBeLessThan(
      onClose.mock.invocationCallOrder[0] as number,
    );
  });

  it("works for a host that subscribes to the keys itself and passes no handler", async () => {
    // `onChanged` is optional on purpose: a host rendering from `useQuery` needs nothing
    // beyond the invalidation. Dropping the prop must not break the write path.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <RenewalsPreviewPanel engagement={engagement} onClose={onClose} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "lifecycle write settled" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(invalidatedKeys(invalidateQueries)).toContain(
      JSON.stringify(crmQueryKeys.renewals.lists()),
    );
  });
});
