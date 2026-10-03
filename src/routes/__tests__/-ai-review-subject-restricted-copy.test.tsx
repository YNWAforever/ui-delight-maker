// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { agentQueueSearchSchema } from "@/lib/agent-queue-input";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `loadAiReviewRead` (`src/server/read-models/agent-workspaces.ts`) sets
 * `subject_restricted: true` on a pending approval when the reader lacks the view capability
 * for that approval's run's subject, and nulls `context_data`, `context_summary` and
 * `reviewer_notes` for it. `/ai-review` is supposed to render dedicated copy for that state —
 * "Restricted. This approval is about a record you do not have permission to view." in both the
 * Agent summary section and the Advanced / raw payload disclosure — instead of falling through
 * to the unrestricted placeholders ("No summary provided." / "No payload data"), which would
 * report a permission boundary as an absence of data.
 *
 * Harness cloned from `-ai-review-decisions.test.tsx`, which already mounts this route end to
 * end via `Route.options.component`, mocking the same server-function seam.
 */

const { routerInvalidateMock, decideApprovalMock } = vi.hoisted(() => ({
  routerInvalidateMock: vi.fn(),
  decideApprovalMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/ai-review",
    useLoaderData: vi.fn(),
    useRouteContext: vi.fn(),
  }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: routerInvalidateMock }),
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/server-functions/agent-runs", () => ({ getAiReviewRead: vi.fn() }));
vi.mock("@/server-functions/approvals", () => ({
  getLastReviewedAtFn: vi.fn().mockResolvedValue(null),
  decideApproval: decideApprovalMock,
  getApprovalDetailFn: vi.fn(),
}));
vi.mock("@/server-functions/quotes", () => ({
  approveQuote: vi.fn(),
  rejectQuote: vi.fn(),
}));

import type { AiReviewRead } from "@/server-functions/agent-runs";
import { Route } from "../ai-review";

const RESTRICTED_COPY =
  "Restricted. This approval is about a record you do not have permission to view.";

type Approval = AiReviewRead["approvals"][number];

const approval = (overrides: Partial<Approval> = {}): Approval => ({
  id: "ap-1",
  agent_run_id: "run-1",
  approval_type: "message_send",
  requested_by: "Reply Draft Agent",
  assigned_to: null,
  status: "pending",
  row_version: 0,
  superseded_by: null,
  context_data: { lead_id: "lead-1", confidence_score: 0.82 },
  context_summary: "Reply drafted for Northstar",
  reviewer_notes: null,
  decided_at: null,
  created_at: "2026-08-02T09:00:00.000Z",
  subject_restricted: false,
  ...overrides,
});

function renderQueue(approvals: Approval[]) {
  vi.mocked(Route.useLoaderData).mockReturnValue({
    approvals,
    humanReviewRuns: [],
  } as never);
  vi.mocked(Route.useRouteContext).mockReturnValue({
    profile: { id: "user-1", role: "manager" },
  } as never);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Component = Route.options.component as ComponentType;

  render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  decideApprovalMock.mockReset();
  routerInvalidateMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("/ai-review renders the redaction copy subject_restricted implies", () => {
  it("shows the restriction copy for a restricted approval, not the unrestricted placeholders", () => {
    renderQueue([
      approval({
        subject_restricted: true,
        context_data: null,
        context_summary: null,
        reviewer_notes: null,
      }),
    ]);

    // Once in the Agent summary section, once in the Advanced / raw payload disclosure.
    expect(screen.getAllByText(RESTRICTED_COPY)).toHaveLength(2);
    expect(screen.queryByText("No summary provided.")).toBeNull();
    expect(screen.queryByText("No payload data")).toBeNull();
  });

  it("renders the payload and summary for an unrestricted approval", () => {
    renderQueue([approval({ subject_restricted: false })]);

    // Once in the queue card, once in the detail panel's Agent summary section.
    expect(screen.getAllByText("Reply drafted for Northstar")).toHaveLength(2);
    const disclosure = screen.getByText("Raw agent payload").closest("details");
    expect(disclosure?.querySelector("pre")?.textContent).toContain("confidence_score");
    expect(screen.queryByText(RESTRICTED_COPY)).toBeNull();
  });
});

it("restricted mutation reply cannot reintroduce raw content or notes", async () => {
  const row = approval({
    subject_restricted: true,
    context_data: null,
    context_summary: null,
    reviewer_notes: null,
    row_version: 7,
  });
  decideApprovalMock.mockResolvedValue({
    ...row,
    status: "approved",
    row_version: 8,
    context_data: { secret: "synthetic-restricted-secret" },
    context_summary: "synthetic-restricted-secret",
    reviewer_notes: "synthetic-restricted-secret",
  });
  const client = renderQueue([row]);
  vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
  await waitFor(() => expect(screen.getByText(/cannot be undone/)).toBeTruthy());
  expect(screen.queryByText("synthetic-restricted-secret")).toBeNull();
  expect(screen.getAllByText(RESTRICTED_COPY)).toHaveLength(2);
});

it("a newly restricted authorized read removes previously visible confirmed content", async () => {
  const row = approval({
    row_version: 7,
    context_summary: "synthetic-prior-visible-content",
    context_data: { memo: "synthetic-prior-visible-content" },
  });
  decideApprovalMock.mockResolvedValue({ ...row, status: "approved", row_version: 8 });
  const client = renderQueue([row]);
  vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
  await waitFor(() => expect(screen.getByText(/cannot be undone/)).toBeTruthy());
  const { crmQueryKeys } = await import("@/lib/query-keys");
  await act(async () => {
    client.setQueryData(
      crmQueryKeys.aiReview.list({ view: "queue", ...agentQueueSearchSchema.parse({}) }),
      {
        approvals: [
          {
            ...row,
            status: "approved",
            row_version: 8,
            subject_restricted: true,
            context_summary: null,
            context_data: null,
            reviewer_notes: null,
          },
        ],
        humanReviewRuns: [],
      },
    );
  });
  await waitFor(() =>
    expect(screen.queryAllByText("synthetic-prior-visible-content")).toHaveLength(0),
  );
  expect(screen.getAllByText(RESTRICTED_COPY)).toHaveLength(2);
});
