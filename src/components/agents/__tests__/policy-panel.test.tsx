// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ history: vi.fn(), set: vi.fn(), rollback: vi.fn() }));
vi.mock("@/server-functions/agent-policy", () => ({
  getAgentPolicyHistory: api.history,
  setAgentPolicyFn: api.set,
  rollbackAgentPolicyFn: api.rollback,
}));
import { PolicyPanel } from "../policy-panel";
const current = "00000000-0000-4000-8000-000000000001",
  old = "00000000-0000-4000-8000-000000000002";
const page = (changes = {}) => ({
  actorId: "policy-fixture-actor",
  items: [
    {
      id: current,
      workflow_type: "qualify_lead",
      status: "active",
      human_approval: true,
      changed_by: "actor",
      reason: "Current operator decision",
      created_at: "2026-10-03T00:00:00.123456Z",
      version_seq: "2",
    },
    {
      id: old,
      workflow_type: "qualify_lead",
      status: "inactive",
      human_approval: false,
      changed_by: "actor",
      reason: "Historical operator pause",
      created_at: "2026-10-02T00:00:00.123456Z",
      version_seq: "1",
    },
  ],
  nextCursor: null,
  effectiveVersionId: current,
  effectivePolicy: { status: "active", humanApproval: true },
  canConfigure: true,
  ...changes,
});
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <PolicyPanel workflowType="qualify_lead" />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  api.history.mockResolvedValue(page());
  api.set.mockResolvedValue({ versionId: "new", status: "inactive", humanApproval: true });
  api.rollback.mockResolvedValue({ versionId: "new", status: "inactive", humanApproval: true });
});
afterEach(cleanup);
describe("status-only policy controls", () => {
  it("view-only readers cannot change or restore policy", async () => {
    api.history.mockResolvedValue(page({ canConfigure: false }));
    mount();
    const select = await screen.findByLabelText("Policy status");
    expect((select as HTMLSelectElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Preview status change" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(api.set).not.toHaveBeenCalled();
    expect(api.rollback).not.toHaveBeenCalled();
  });
  it("previews impact and submits status/CAS/reason without approval controls", async () => {
    mount();
    fireEvent.change(await screen.findByLabelText("Policy status"), {
      target: { value: "inactive" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Paused for operator review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview status change" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/In-flight runs are not cancelled/)).toBeTruthy();
    expect(screen.getAllByText(/Worker\/provider readiness: unknown/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm policy change" }));
    await waitFor(() =>
      expect(api.set).toHaveBeenCalledWith({
        data: {
          workflowType: "qualify_lead",
          status: "inactive",
          expectedVersionId: current,
          reason: "Paused for operator review",
        },
      }),
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });
  it("keeps reason and captured version after a stale failure and restores focus on cancel", async () => {
    api.set.mockRejectedValue(Object.assign(new Error("Policy changed"), { code: "CONFLICT" }));
    mount();
    fireEvent.change(await screen.findByLabelText("Policy status"), {
      target: { value: "inactive" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Paused for operator review" },
    });
    const preview = screen.getByRole("button", { name: "Preview status change" });
    fireEvent.click(preview);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm policy change" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toBe(
      "Paused for operator review",
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep current policy" }));
    await waitFor(() => expect(document.activeElement).toBe(preview));
  });
  it("rollback restores a historical status without applying its old approval flag", async () => {
    mount();
    await screen.findByLabelText("Policy status");
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Restore historical status only" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore status from version 1" }));
    expect(await screen.findByText(/Current human approval remains Required/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm policy change" }));
    await waitFor(() =>
      expect(api.rollback).toHaveBeenCalledWith({
        data: {
          workflowType: "qualify_lead",
          versionId: old,
          expectedVersionId: current,
          reason: "Restore historical status only",
        },
      }),
    );
  });
  it("loads older versions using the real cursor", async () => {
    api.history.mockResolvedValueOnce(page({ nextCursor: "safe-cursor" })).mockResolvedValueOnce(
      page({
        items: [
          {
            ...page().items[1],
            id: "00000000-0000-4000-8000-000000000003",
            version_seq: "3",
            created_at: "2020-01-01T00:00:00.123456Z",
          },
        ],
        nextCursor: null,
      }),
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Load older policy versions" }));
    await screen.findByText("Version 3");
    expect(api.history).toHaveBeenLastCalledWith({
      data: { workflowType: "qualify_lead", limit: 25, cursor: "safe-cursor" },
    });
    expect(screen.getByText("Version 2")).toBeTruthy();
  });
  it("reloads a stale version while keeping the reason for a fresh preview", async () => {
    mount();
    await screen.findByLabelText("Reason");
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Paused for operator review" },
    });
    api.history.mockResolvedValue(
      page({
        effectiveVersionId: old,
        effectivePolicy: { status: "inactive", humanApproval: true },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload policy" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Policy status") as HTMLSelectElement).value).toBe("inactive"),
    );
    expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toBe(
      "Paused for operator review",
    );
    fireEvent.change(screen.getByLabelText("Policy status"), { target: { value: "active" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview status change" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm policy change" }));
    await waitFor(() =>
      expect(api.set).toHaveBeenCalledWith({
        data: {
          workflowType: "qualify_lead",
          expectedVersionId: old,
          status: "active",
          reason: "Paused for operator review",
        },
      }),
    );
  });
});
