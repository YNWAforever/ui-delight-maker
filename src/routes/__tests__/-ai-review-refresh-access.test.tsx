// @vitest-environment jsdom
import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminError } from "@/lib/admin/errors";
import { crmQueryKeys } from "@/lib/query-keys";
const api = vi.hoisted(() => ({ read: vi.fn(), decide: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/ai-review",
    useLoaderData: vi.fn(),
    useRouteContext: vi.fn(),
  }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/server-functions/agent-runs", () => ({ getAiReviewRead: api.read }));
vi.mock("@/server-functions/approvals", () => ({
  getLastReviewedAtFn: vi.fn().mockResolvedValue(null),
  getApprovalDetailFn: vi.fn(),
  decideApproval: api.decide,
}));
vi.mock("@/server-functions/quotes", () => ({ approveQuote: vi.fn(), rejectQuote: vi.fn() }));
import { Route } from "../ai-review";
const data = {
  approvals: [
    {
      id: "ap-1",
      agent_run_id: "run-1",
      approval_type: "message_send",
      requested_by: "Reply Draft Agent",
      assigned_to: null,
      status: "pending",
      row_version: 1,
      superseded_by: null,
      context_data: { draft_message: "SYNTHETIC prior draft body" },
      context_summary: "SYNTHETIC prior approval summary",
      reviewer_notes: null,
      decided_at: null,
      created_at: "2026-10-04T00:00:00Z",
      subject_restricted: false,
    },
  ],
  humanReviewRuns: [
    {
      id: "run-1",
      agent_name: "Reply Draft Agent",
      output_summary: "SYNTHETIC prior run output",
      status: "waiting_approval",
      duration_ms: null,
      tokens_used: null,
      confidence_score: null,
      human_review_required: true,
      created_at: "2026-10-04T00:00:00Z",
    },
  ],
};
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  api.read.mockResolvedValue(data);
  vi.mocked(Route.useLoaderData).mockReturnValue(data as never);
  vi.mocked(Route.useRouteContext).mockReturnValue({
    profile: { id: "admin-fixture", role: "admin" },
  } as never);
});
afterEach(() => {
  cleanup();
  for (const c of clients.splice(0)) c.clear();
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const Component = Route.options.component as ComponentType;
  render(
    <QueryClientProvider client={client}>
      <Component />
    </QueryClientProvider>,
  );
  return client;
}
async function failRefresh(client: QueryClient, error: Error) {
  api.read.mockRejectedValue(error);
  await act(async () => {
    await client.invalidateQueries({ queryKey: crmQueryKeys.aiReview.all() });
  });
  await waitFor(() =>
    expect(
      client
        .getQueryCache()
        .getAll()
        .find((q) => q.queryKey[0] === crmQueryKeys.aiReview.all()[0])?.state.status,
    ).toBe("error"),
  );
}
describe("AI Review settled refresh errors with retained query cache", () => {
  it.each([
    [401, new AdminError("UNAUTHENTICATED", "Sign in again")],
    [403, new AdminError("FORBIDDEN", "Capability removed")],
    [500, new Error("RAW_BACKEND_DIAGNOSTIC_do_not_render")],
  ])(
    "hides previous approval content and decisions after %s while retaining a safe retry",
    async (_status, error) => {
      const client = mount();
      expect(screen.getAllByText("SYNTHETIC prior approval summary").length).toBeGreaterThan(0);
      await failRefresh(client, error as Error);
      expect(screen.queryAllByText("SYNTHETIC prior approval summary")).toHaveLength(0);
      expect(screen.queryByText("SYNTHETIC prior draft body")).toBeNull();
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.queryAllByRole("button", { name: /^Approve$/ })).toHaveLength(0);
      expect(screen.queryByLabelText("Reviewer notes or decision reason")).toBeNull();
      expect(screen.getByText("The AI review queue did not load")).toBeTruthy();
      expect(screen.queryByText("RAW_BACKEND_DIAGNOSTIC_do_not_render")).toBeNull();
      expect(api.decide).not.toHaveBeenCalled();
    },
  );
  it("withdraws an open decision preview and draft notes on background denial; a successful read cannot revive them", async () => {
    const client = mount();
    fireEvent.change(screen.getByLabelText("Reviewer notes or decision reason"), {
      target: { value: "SYNTHETIC prior reviewer notes" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /^Approve$/ }).at(-1)!);
    await screen.findByRole("alertdialog");
    await failRefresh(client, new AdminError("FORBIDDEN", "Capability removed"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    api.read.mockResolvedValue(data);
    await act(async () => {
      await client.invalidateQueries({ queryKey: crmQueryKeys.aiReview.all() });
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Reviewer notes or decision reason")).toHaveProperty(
        "value",
        "",
      ),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.decide).not.toHaveBeenCalled();
  });
  it("a pending same-query refresh retains authorized content and reviewer draft until the result settles", async () => {
    const client = mount();
    fireEvent.change(screen.getByLabelText("Reviewer notes or decision reason"), {
      target: { value: "SYNTHETIC pending reviewer draft" },
    });
    let resolve!: (value: typeof data) => void;
    api.read.mockReturnValue(
      new Promise<typeof data>((r) => {
        resolve = r;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Refresh$/ }));
    await waitFor(() => expect(client.isFetching()).toBeGreaterThan(0));
    expect(screen.getAllByText("SYNTHETIC prior approval summary").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Reviewer notes or decision reason")).toHaveProperty(
      "value",
      "SYNTHETIC pending reviewer draft",
    );
    await act(async () => {
      resolve(data);
    });
    expect(screen.getByLabelText("Reviewer notes or decision reason")).toHaveProperty(
      "value",
      "SYNTHETIC pending reviewer draft",
    );
    expect(api.decide).not.toHaveBeenCalled();
  });
});
