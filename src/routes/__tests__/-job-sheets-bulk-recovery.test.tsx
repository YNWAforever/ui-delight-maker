// @vitest-environment jsdom
import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const getBulkResultMock = vi.hoisted(() => vi.fn());
const commitBulkMock = vi.hoisted(() => vi.fn());
const resumeBulkMock = vi.hoisted(() => vi.fn());
const previewBulkMock = vi.hoisted(() => vi.fn());
const pageMock = vi.hoisted(() => vi.fn());
const listPeopleMock = vi.hoisted(() => vi.fn());
const resolvePersonMock = vi.hoisted(() => vi.fn());
vi.mock("@/server-functions/bulk-operations", () => ({
  getBulkResultFn: getBulkResultMock,
  commitBulkFn: commitBulkMock,
  resumeBulkFn: resumeBulkMock,
  previewBulkFn: previewBulkMock,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useLoaderData: pageMock,
    useSearch: () => ({
      page: 1,
      limit: 50,
      status: "all",
      company: "",
      quoteNumber: "",
      accountingOwner: "",
      po: "",
      createdFrom: "",
      createdTo: "",
    }),
  }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }),
  Outlet: () => null,
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/lib/routing-utils", () => ({ useIsExactPath: () => true }));
vi.mock("@/server-functions/job-sheets", () => ({ getJobSheetsPage: vi.fn() }));
vi.mock("@/server-functions/assignable-profiles", () => ({
  listAssignableProfilesFn: listPeopleMock,
  resolveAssignableProfileFn: resolvePersonMock,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));
import { Route } from "../job-sheets";
function renderSheets(items: Array<Record<string, unknown>> = []) {
  pageMock.mockReturnValue({ items, total: items.length, page: 1, limit: 50 });
  const q = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(q, "invalidateQueries").mockResolvedValue();
  const Component = Route.options.component as ComponentType;
  return render(
    <QueryClientProvider client={q}>
      <Component />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  sessionStorage.clear();
  getBulkResultMock.mockReset();
  commitBulkMock.mockReset();
  resumeBulkMock.mockReset();
  previewBulkMock.mockReset();
  listPeopleMock.mockReset().mockResolvedValue({
    items: [
      {
        id: "accountant-2",
        displayName: "Named accounting owner",
        isEligible: true,
        reason: null,
      },
    ],
    total: 1,
    nextCursor: null,
  });
  resolvePersonMock.mockReset().mockResolvedValue({
    id: "accountant-2",
    displayName: "Named accounting owner",
    isEligible: true,
    reason: null,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const savedBulkCommit = {
  kind: "pending_commit",
  operationId: "owned-operation",
  previewToken: "original-preview",
  idempotencyKey: "original-key",
};
const ownedBulkReceipt = {
  operationId: "owned-operation",
  state: "paused" as const,
  processed: 1,
  total: 2,
  remainingIds: ["pending-item"],
  results: [{ id: "succeeded-item", status: "succeeded" as const, retryable: false }],
};

describe("Job Sheet owner durable bulk receipt recovery", () => {
  it("keeps and retries the original receipt with no selected rows, then resumes the exact saved commit key", async () => {
    const saved = JSON.stringify(savedBulkCommit);
    sessionStorage.setItem("clientops:bulk:job-sheets", saved);
    getBulkResultMock
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValue(ownedBulkReceipt);
    commitBulkMock.mockResolvedValue({
      ...ownedBulkReceipt,
      state: "completed",
      processed: 2,
      results: [
        ...ownedBulkReceipt.results,
        { id: "pending-item", status: "forbidden", retryable: false },
      ],
    });
    renderSheets();
    const retry = await screen.findByRole("button", { name: "Retry loading result" });
    expect(sessionStorage.getItem("clientops:bulk:job-sheets")).toBe(saved);
    expect(commitBulkMock).not.toHaveBeenCalled();
    expect(previewBulkMock).not.toHaveBeenCalled();
    fireEvent.click(retry);
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    await waitFor(() =>
      expect(commitBulkMock).toHaveBeenCalledWith({
        data: { previewToken: "original-preview", idempotencyKey: "original-key" },
      }),
    );
    expect(resumeBulkMock).not.toHaveBeenCalled();
    expect(previewBulkMock).not.toHaveBeenCalled();
    await screen.findByText(/2 of 2 processed; 1 succeeded; 1 need review/);
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(screen.getByRole("button", { name: "Download failures" })).toBeTruthy();
    expect(sessionStorage.getItem("clientops:bulk:job-sheets")).toBe("owned-operation");
  });
  it("keeps an owned receipt readable when no row can be changed and can dismiss it without a command", async () => {
    sessionStorage.setItem("clientops:bulk:job-sheets", JSON.stringify(savedBulkCommit));
    getBulkResultMock.mockResolvedValue({ ...ownedBulkReceipt, state: "completed", processed: 2 });
    renderSheets();
    await screen.findByText(/2 of 2 processed/);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(sessionStorage.getItem("clientops:bulk:job-sheets")).toBeNull();
    expect(commitBulkMock).not.toHaveBeenCalled();
    expect(previewBulkMock).not.toHaveBeenCalled();
  });
  it("discards an inaccessible receipt without exposing its details or offering a write", async () => {
    sessionStorage.setItem("clientops:bulk:job-sheets", "another-actor-operation");
    getBulkResultMock.mockRejectedValue(new Error("Bulk operation owner access denied"));
    renderSheets();
    await waitFor(() => expect(sessionStorage.getItem("clientops:bulk:job-sheets")).toBeNull());
    expect(screen.queryByRole("button", { name: "Retry loading result" })).toBeNull();
    expect(document.body.textContent).not.toContain("another-actor-operation");
    expect(commitBulkMock).not.toHaveBeenCalled();
    expect(previewBulkMock).not.toHaveBeenCalled();
  });
});

const sheetRow = (id: string, canAssign?: boolean) => ({
  id,
  number: "JS " + id,
  quote_id: "quote-1",
  status: "accounting_review",
  created_at: "2026-10-01T00:00:00Z",
  currency: "HKD",
  total_amount: 200.5,
  accounting_owner: "accountant-1",
  accounting_owner_name: "Current owner",
  can_assign_owner: canAssign,
});
describe("Job Sheet selection keeps permitted export separate from owner writes", () => {
  it.each([false, undefined])(
    "keeps read/export selection while omitting owner controls when assignment is %s",
    (canAssign) => {
      renderSheets([sheetRow("js-1", canAssign)]);
      // Row controls are named by sheet number (audit UX-05), never by id.
      const checkbox = screen.getAllByRole("checkbox", { name: /^Select JS js-1$/ })[0];
      expect((checkbox as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(checkbox);
      expect(screen.getByRole("button", { name: "Export selected on this page" })).toBeTruthy();
      expect(screen.queryByRole("combobox", { name: "Bulk accounting owner search" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Assign owner" })).toBeNull();
    },
  );
  it("previews only independently authorized selected rows with the named writer-purpose picker", async () => {
    renderSheets([sheetRow("js-1", true), sheetRow("js-denied", false)]);
    for (const id of ["js-1", "js-denied"])
      fireEvent.click(screen.getAllByRole("checkbox", { name: "Select JS " + id })[0]);
    fireEvent.change(screen.getByRole("combobox", { name: "Bulk accounting owner search" }), {
      target: { value: "Named" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Named accounting owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign owner" }));
    await waitFor(() =>
      expect(previewBulkMock).toHaveBeenCalledWith({
        data: { action: { type: "job_sheet.assign", profileId: "accountant-2" }, ids: ["js-1"] },
      }),
    );
    expect(listPeopleMock).toHaveBeenCalledWith({
      data: { purpose: "job_sheet_owner", query: "Named", limit: 50, resourceId: "js-1" },
    });
    expect(screen.getByText("2 selected")).toBeTruthy();
  });
});
