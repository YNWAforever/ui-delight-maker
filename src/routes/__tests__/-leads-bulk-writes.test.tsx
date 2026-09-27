// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/types";
import type { BulkResult } from "@/lib/operations/bulk-contract";

const previewBulkMock = vi.hoisted(() => vi.fn());
const commitBulkMock = vi.hoisted(() => vi.fn());
const resumeBulkMock = vi.hoisted(() => vi.fn());
const getBulkResultMock = vi.hoisted(() => vi.fn());
const createLeadMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const routerInvalidateMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/leads",
    useLoaderData: vi.fn(),
    useSearch: () => ({ page: 1, limit: 50 }),
  }),
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: routerInvalidateMock }),
  Outlet: () => null,
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/lib/routing-utils", () => ({ useIsExactPath: () => true }));
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn(), message: vi.fn() },
}));
vi.mock("@/server-functions/leads", () => ({
  getLeadsPage: vi.fn(),
  createLead: createLeadMock,
}));
vi.mock("@/server-functions/bulk-operations", () => ({
  previewBulkFn: previewBulkMock,
  commitBulkFn: commitBulkMock,
  resumeBulkFn: resumeBulkMock,
  getBulkResultFn: getBulkResultMock,
}));

import { Route } from "../leads";

const makeLead = (id: string, name: string): Lead => ({
  id,
  company_name: name,
  contact_id: null,
  account_id: null,
  source_campaign_id: null,
  campaign_member_id: null,
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  source: "website",
  status: "new",
  assigned_to: null,
  lead_score: 50,
  qualification_data: null,
  enquiry_text: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
});
const LEADS = [makeLead("lead-1", "Northstar"), makeLead("lead-2", "Bluepeak")];
const preview = {
  operationId: "operation-1",
  token: "preview-1",
  expiresAt: "2026-09-27T12:00:00.000Z",
  rows: LEADS.map((lead) => ({
    id: lead.id,
    eligible: true,
    summary: lead.company_name,
    expectedVersion: 0,
  })),
  eligibleCount: 2,
};
const partialResult: BulkResult = {
  operationId: "operation-1",
  state: "paused",
  processed: 2,
  total: 2,
  remainingIds: ["lead-2"],
  results: [
    { id: "lead-1", status: "succeeded", retryable: false },
    { id: "lead-2", status: "failed", code: "RETRY", retryable: true },
  ],
};
const completedResult: BulkResult = {
  ...partialResult,
  state: "completed",
  remainingIds: [],
  results: [
    { id: "lead-1", status: "succeeded", retryable: false },
    { id: "lead-2", status: "succeeded", retryable: false },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
beforeEach(() => {
  sessionStorage.clear();
  for (const mock of [
    previewBulkMock,
    commitBulkMock,
    resumeBulkMock,
    getBulkResultMock,
    createLeadMock,
    navigateMock,
    routerInvalidateMock,
    toastErrorMock,
  ])
    mock.mockReset();
  previewBulkMock.mockResolvedValue(preview);
  commitBulkMock.mockResolvedValue(partialResult);
  resumeBulkMock.mockResolvedValue(completedResult);
  getBulkResultMock.mockResolvedValue(partialResult);
  vi.mocked(Route.useLoaderData).mockReturnValue({
    items: LEADS,
    total: 2,
    page: 1,
    limit: 50,
  } as never);
});
afterEach(cleanup);

function renderLeads() {
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
const rowCheckbox = (id: string) =>
  screen.getAllByRole("checkbox", { name: "Select row " + id, hidden: true })[0];
const selectEveryLead = () =>
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
async function prepareQualified() {
  fireEvent.click(screen.getByRole("button", { name: "Mark qualified" }));
  const confirm = await screen.findByRole("alertdialog");
  fireEvent.click(within(confirm).getByRole("button", { name: "Mark qualified" }));
  return screen.findByRole("dialog", { name: "Review bulk change" });
}
async function commitPreview() {
  const dialog = await screen.findByRole("dialog", { name: "Review bulk change" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Process first 20" }));
}

describe("Leads bulk preview and durable partial results", () => {
  it("previews fixed IDs without writing from the browser", async () => {
    renderLeads();
    selectEveryLead();
    await prepareQualified();
    expect(previewBulkMock).toHaveBeenCalledWith({
      data: { action: { type: "lead.status", status: "qualified" }, ids: ["lead-1", "lead-2"] },
    });
    expect(commitBulkMock).not.toHaveBeenCalled();
    expect(screen.getByText(/2 of 2 selected items were eligible/)).toBeTruthy();
  });

  it("refreshes after a partial commit and keeps only failed IDs selected", async () => {
    const { invalidateQueries } = renderLeads();
    selectEveryLead();
    await prepareQualified();
    await commitPreview();
    await waitFor(() => expect(screen.getByText(/2 of 2 processed/)).toBeTruthy());
    expect(rowCheckbox("lead-1").getAttribute("aria-checked")).toBe("false");
    expect(rowCheckbox("lead-2").getAttribute("aria-checked")).toBe("true");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["leads", "list"] });
    expect(routerInvalidateMock).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("clientops:bulk:leads")).toBe("operation-1");
  });

  it("resumes the persisted operation and does not resubmit successful IDs", async () => {
    renderLeads();
    selectEveryLead();
    await prepareQualified();
    await commitPreview();
    await waitFor(() => expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() =>
      expect(resumeBulkMock).toHaveBeenCalledWith({
        data: { operationId: "operation-1" },
      }),
    );
    await waitFor(() => expect(rowCheckbox("lead-2").getAttribute("aria-checked")).toBe("false"));
    expect(previewBulkMock).toHaveBeenCalledTimes(1);
  });

  it("restores the failed selection after a page refresh", async () => {
    sessionStorage.setItem("clientops:bulk:leads", "operation-1");
    renderLeads();
    await waitFor(() =>
      expect(getBulkResultMock).toHaveBeenCalledWith({
        data: { operationId: "operation-1" },
      }),
    );
    await waitFor(() => expect(rowCheckbox("lead-2").getAttribute("aria-checked")).toBe("true"));
    expect(rowCheckbox("lead-1").getAttribute("aria-checked")).toBe("false");
  });

  it("prevents a second preview while the first request is in flight", async () => {
    const pending = deferred<typeof preview>();
    previewBulkMock.mockReturnValueOnce(pending.promise);
    renderLeads();
    selectEveryLead();
    fireEvent.click(screen.getByRole("button", { name: "Mark qualified" }));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Mark qualified" }));
    expect(previewBulkMock).toHaveBeenCalledTimes(1);
    expect(
      within(confirm).getByRole("button", { name: "Updating…" }).hasAttribute("disabled"),
    ).toBe(true);
    await act(async () => {
      pending.resolve(preview);
    });
    expect(previewBulkMock).toHaveBeenCalledTimes(1);
  });

  it("trims an owner ID, and refuses an empty one before preview", async () => {
    renderLeads();
    selectEveryLead();
    fireEvent.click(screen.getByRole("button", { name: "Assign owner" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Owner user ID"), { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));
    expect(previewBulkMock).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Owner user ID"), {
      target: { value: "  user-77  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));
    await waitFor(() =>
      expect(previewBulkMock).toHaveBeenCalledWith({
        data: { action: { type: "lead.assign", profileId: "user-77" }, ids: ["lead-1", "lead-2"] },
      }),
    );
  });

  it("keeps selection and assignment context when preview is refused", async () => {
    previewBulkMock.mockRejectedValueOnce(new Error("Preview refused"));
    renderLeads();
    selectEveryLead();
    fireEvent.click(screen.getByRole("button", { name: "Assign owner" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Owner user ID"), {
      target: { value: "user-77" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledOnce());
    expect(within(dialog).getByLabelText("Owner user ID")).toHaveProperty("value", "user-77");
    expect(rowCheckbox("lead-1").getAttribute("aria-checked")).toBe("true");
    expect(rowCheckbox("lead-2").getAttribute("aria-checked")).toBe("true");
  });
});
