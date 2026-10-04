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

vi.mock("@/server-functions/assignable-profiles", () => ({
  listAssignableProfilesFn: vi.fn().mockResolvedValue({
    items: [{ id: "user-77", displayName: "Named owner", isEligible: true, reason: null }],
    total: 1,
    nextCursor: null,
  }),
  resolveAssignableProfileFn: vi.fn().mockResolvedValue({
    id: "user-77",
    displayName: "Named owner",
    isEligible: true,
    reason: null,
  }),
}));
import { listAssignableProfilesFn } from "@/server-functions/assignable-profiles";
import { Route } from "../leads";

const makeLead = (
  id: string,
  name: string,
): Lead & { can_update: boolean; owner_display_name?: string | null } => ({
  can_update: true,
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
/** Row controls are named by company (audit UX-05), never by id. */
const LEAD_NAME: Record<string, string> = {
  "lead-1": "Northstar",
  "lead-2": "Bluepeak",
  "lead-3": "Unassigned lead",
};
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
    can_create: true,
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
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
  return {
    invalidateQueries,
    unmount: view.unmount,
    rerender: () =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <Component />
        </QueryClientProvider>,
      ),
  };
}
const rowCheckbox = (id: string) =>
  screen.getAllByRole("checkbox", { name: "Select " + LEAD_NAME[id], hidden: true })[0];
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

  it("replays the same commit key after a lost response and page reload", async () => {
    commitBulkMock
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce(completedResult);
    const view = renderLeads();
    selectEveryLead();
    await prepareQualified();
    await commitPreview();
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledOnce());
    const stored = JSON.parse(sessionStorage.getItem("clientops:bulk:leads") || "{}");
    expect(stored).toMatchObject({
      kind: "pending_commit",
      operationId: "operation-1",
      previewToken: "preview-1",
      idempotencyKey: expect.any(String),
    });

    view.unmount();
    renderLeads();
    await waitFor(() => expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(commitBulkMock).toHaveBeenCalledTimes(2));
    expect(commitBulkMock.mock.calls[1][0].data).toEqual(commitBulkMock.mock.calls[0][0].data);
    expect(resumeBulkMock).not.toHaveBeenCalled();
    await waitFor(() => expect(sessionStorage.getItem("clientops:bulk:leads")).toBe("operation-1"));
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

  it("selects a named eligible owner and refuses an empty selection before preview", async () => {
    renderLeads();
    selectEveryLead();
    fireEvent.click(screen.getByRole("button", { name: "Assign owner" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));
    expect(previewBulkMock).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Owner search" }), {
      target: { value: "Named" },
    });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Named owner" }));
    expect(listAssignableProfilesFn).toHaveBeenCalledWith({
      data: { purpose: "lead_assign", query: "Named", limit: 50, resourceId: "lead-1" },
    });
    expect(within(dialog).queryByLabelText("Owner user ID")).toBeNull();
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
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Owner search" }), {
      target: { value: "Named" },
    });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Named owner" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledOnce());
    expect(await within(dialog).findByText("Named owner", { exact: false })).toBeTruthy();
    expect(rowCheckbox("lead-1").getAttribute("aria-checked")).toBe("true");
    expect(rowCheckbox("lead-2").getAttribute("aria-checked")).toBe("true");
  });
  it("keeps a pending receipt through a transient reload failure and retries the result read", async () => {
    const pending = JSON.stringify({
      kind: "pending_commit",
      operationId: "operation-1",
      previewToken: "preview-1",
      idempotencyKey: "same-logical-key",
    });
    sessionStorage.setItem("clientops:bulk:leads", pending);
    getBulkResultMock.mockRejectedValueOnce(new TypeError("Network unavailable"));
    renderLeads();

    const retry = await screen.findByRole("button", { name: "Retry loading result" });
    expect(sessionStorage.getItem("clientops:bulk:leads")).toBe(pending);
    expect(commitBulkMock).not.toHaveBeenCalled();

    fireEvent.click(retry);
    await waitFor(() => expect(getBulkResultMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() =>
      expect(commitBulkMock).toHaveBeenCalledWith({
        data: { previewToken: "preview-1", idempotencyKey: "same-logical-key" },
      }),
    );
  });

  it("clears an inaccessible receipt without showing its operation details", async () => {
    sessionStorage.setItem("clientops:bulk:leads", "operation-from-another-actor");
    getBulkResultMock.mockRejectedValueOnce(new Error("Bulk operation owner access denied"));
    renderLeads();
    await waitFor(() => expect(sessionStorage.getItem("clientops:bulk:leads")).toBeNull());
    expect(screen.queryByRole("button", { name: "Retry loading result" })).toBeNull();
    expect(document.body.textContent).not.toContain("operation-from-another-actor");
  });
});

describe("Lead controls reflect the server decision", () => {
  function page(
    items: Array<Lead & { can_update?: boolean; owner_display_name?: string | null }>,
    can_create?: boolean,
  ) {
    vi.mocked(Route.useLoaderData).mockReturnValue({
      items,
      can_create,
      total: items.length,
      page: 1,
      limit: 50,
    } as never);
  }
  it.each([false, undefined])("keeps denied or legacy responses read-only (%s)", (allowed) => {
    page(
      LEADS.map((row) => ({ ...row, can_update: allowed })),
      allowed,
    );
    renderLeads();
    expect(screen.queryByRole("button", { name: "New lead" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Select all rows" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark qualified" })).toBeNull();
    expect(createLeadMock).not.toHaveBeenCalled();
  });
  it("select-all and preview exclude an explicitly denied row", async () => {
    page([{ ...LEADS[0], can_update: false }, LEADS[1]], false);
    renderLeads();
    expect(rowCheckbox("lead-1").hasAttribute("disabled")).toBe(true);
    selectEveryLead();
    await prepareQualified();
    expect(previewBulkMock).toHaveBeenCalledWith({
      data: { action: { type: "lead.status", status: "qualified" }, ids: ["lead-2"] },
    });
    expect(rowCheckbox("lead-1").getAttribute("aria-checked")).toBe("false");
  });
  it("retains a revoked selection for review while removing fresh write actions", async () => {
    const view = renderLeads();
    selectEveryLead();
    page(
      LEADS.map((row) => ({ ...row, can_update: false })),
      false,
    );
    view.rerender();
    await waitFor(() => expect(rowCheckbox("lead-1").hasAttribute("disabled")).toBe(true));
    expect(rowCheckbox("lead-1").getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("button", { name: "Assign owner" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New lead" })).toBeNull();
    expect(previewBulkMock).not.toHaveBeenCalled();
  });
  it("keeps an owned durable receipt readable after write permission is removed", async () => {
    sessionStorage.setItem("clientops:bulk:leads", "operation-1");
    page(
      LEADS.map((row) => ({ ...row, can_update: false })),
      false,
    );
    renderLeads();
    await waitFor(() => expect(screen.getByText(/2 of 2 processed/)).toBeTruthy());
    expect(rowCheckbox("lead-2").getAttribute("aria-checked")).toBe("true");
    expect(rowCheckbox("lead-2").hasAttribute("disabled")).toBe(true);
    expect(sessionStorage.getItem("clientops:bulk:leads")).toBe("operation-1");
    expect(screen.queryByRole("button", { name: "Mark lost" })).toBeNull();
    expect(commitBulkMock).not.toHaveBeenCalled();
  });
  it("shows owner names and distinguishes missing historical owners from unassigned rows", () => {
    page(
      [
        {
          ...LEADS[0],
          assigned_to: "internal-profile-250",
          owner_display_name: "Owner beyond first page",
        },
        { ...LEADS[1], assigned_to: "orphan-profile", owner_display_name: null },
        { ...makeLead("lead-3", "Unassigned lead"), owner_display_name: null },
      ],
      true,
    );
    renderLeads();
    expect(screen.getAllByText("Owner beyond first page").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Owner unavailable").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("internal-profile-250");
    expect(document.body.textContent).not.toContain("orphan-profile");
    expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0);
  });
});
