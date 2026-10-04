// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminError } from "@/lib/admin/errors";
import { crmQueryKeys } from "@/lib/query-keys";
const api = vi.hoisted(() => ({ history: vi.fn(), set: vi.fn(), rollback: vi.fn() }));
vi.mock("@/server-functions/agent-policy", () => ({
  getAgentPolicyHistory: api.history,
  setAgentPolicyFn: api.set,
  rollbackAgentPolicyFn: api.rollback,
}));
import { PolicyPanel } from "../policy-panel";
const current = "00000000-0000-4000-8000-000000000001";
const page = (actorId = "actual-admin", canConfigure = true) => ({
  actorId,
  canConfigure,
  nextCursor: "older-cursor",
  effectiveVersionId: current,
  effectivePolicy: { status: "active", humanApproval: true },
  items: [
    {
      id: current,
      workflow_type: "qualify_lead",
      status: "active",
      human_approval: true,
      changed_by: actorId,
      reason: "SYNTHETIC stored operator reason",
      created_at: "2026-10-04T00:00:00Z",
      version_seq: "1",
    },
  ],
});
const clients: QueryClient[] = [];
const key = crmQueryKeys.agents.section("qualify_lead", "policy");
beforeEach(() => {
  vi.resetAllMocks();
  api.history.mockResolvedValue(page());
});
afterEach(() => {
  cleanup();
  for (const c of clients.splice(0)) c.clear();
});
async function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <PolicyPanel workflowType="qualify_lead" />
    </QueryClientProvider>,
  );
  await screen.findByLabelText("Policy status");
  return client;
}
function draft() {
  fireEvent.change(screen.getByLabelText("Policy status"), { target: { value: "inactive" } });
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: { value: "SYNTHETIC private admin draft reason" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview status change" }));
}
async function refresh(client: QueryClient) {
  await act(async () => {
    await client.invalidateQueries({ queryKey: key });
  });
}
async function denied(client: QueryClient, error: Error) {
  api.history.mockRejectedValue(error);
  await refresh(client);
  await waitFor(() => expect(client.getQueryState(key)?.status).toBe("error"));
}
describe("policy read refresh and authoritative actor lifetime", () => {
  it.each([
    [401, new AdminError("UNAUTHENTICATED", "Sign in again")],
    [403, new AdminError("FORBIDDEN", "Access removed")],
    [500, new Error("RAW_POLICY_BACKEND_DIAGNOSTIC")],
  ])(
    "withdraws retained history and confirmation after settled %s with safe retry",
    async (_status, error) => {
      const client = await mount();
      draft();
      await screen.findByRole("alertdialog");
      await denied(client, error as Error);
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.queryByText("SYNTHETIC stored operator reason")).toBeNull();
      expect(screen.queryByLabelText("Reason")).toBeNull();
      expect(screen.queryByRole("button", { name: "Confirm policy change" })).toBeNull();
      expect(screen.getByText("Policy history unavailable.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Reload policy" })).toBeTruthy();
      expect(screen.queryByText("RAW_POLICY_BACKEND_DIAGNOSTIC")).toBeNull();
      expect(api.set).not.toHaveBeenCalled();
      expect(api.rollback).not.toHaveBeenCalled();
    },
  );
  it("same authorized actor successful retry keeps reason for correction without reviving a confirmation", async () => {
    const client = await mount();
    draft();
    await screen.findByRole("alertdialog");
    await denied(client, new Error("Temporary failure"));
    api.history.mockResolvedValue(page());
    fireEvent.click(screen.getByRole("button", { name: "Reload policy" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Reason")).toHaveProperty(
        "value",
        "SYNTHETIC private admin draft reason",
      ),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("Policy status")).toHaveProperty("value", "active");
    expect(api.set).not.toHaveBeenCalled();
  });
  it("an authorized actor change clears old draft and confirmation even with the same policy version", async () => {
    const client = await mount();
    draft();
    await screen.findByRole("alertdialog");
    api.history.mockResolvedValue(page("actual-manager", false));
    await refresh(client);
    await waitFor(() => expect(screen.getByLabelText("Reason")).toHaveProperty("value", ""));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("Reason")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Preview status change" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(api.set).not.toHaveBeenCalled();
  });
  it("a late older-page response cannot resurrect rows after denial and successful owner retry", async () => {
    const client = await mount();
    let resolve!: (value: ReturnType<typeof page>) => void;
    api.history.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof page>>((r) => {
          resolve = r;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Load older policy versions" }));
    await waitFor(() =>
      expect(api.history).toHaveBeenCalledWith({
        data: { workflowType: "qualify_lead", limit: 25, cursor: "older-cursor" },
      }),
    );
    await denied(client, new AdminError("FORBIDDEN", "Access removed"));
    api.history.mockResolvedValue(page());
    await refresh(client);
    await screen.findByLabelText("Reason");
    await act(async () => {
      resolve({
        ...page(),
        items: [
          {
            ...page().items[0],
            id: "00000000-0000-4000-8000-000000000099",
            version_seq: "99",
            reason: "SYNTHETIC withdrawn older-page reason",
          },
        ],
      });
    });
    expect(screen.queryByText("Version 99")).toBeNull();
    expect(screen.queryByText("SYNTHETIC withdrawn older-page reason")).toBeNull();
  });
  it("an older page returned for another authorized actor triggers a fresh read without merging or retaining their predecessor's reason", async () => {
    const client = await mount();
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "SYNTHETIC previous actor draft" },
    });
    api.history.mockResolvedValue(page("actual-manager", false));
    fireEvent.click(screen.getByRole("button", { name: "Load older policy versions" }));
    await waitFor(() => expect(screen.getByLabelText("Reason")).toHaveProperty("value", ""));
    expect(screen.getByLabelText("Reason")).toHaveProperty("disabled", true);
    expect(api.set).not.toHaveBeenCalled();
    expect(client.getQueryData(key)).toMatchObject({ actorId: "actual-manager" });
  });
  it("a denied older-history request reauthorizes the current page and withdraws cached controls", async () => {
    await mount();
    api.history.mockRejectedValue(new AdminError("FORBIDDEN", "Access removed"));
    fireEvent.click(screen.getByRole("button", { name: "Load older policy versions" }));
    await screen.findByText("Policy history unavailable.");
    expect(screen.queryByLabelText("Reason")).toBeNull();
    expect(screen.queryByRole("list", { name: "Policy version history" })).toBeNull();
    expect(api.set).not.toHaveBeenCalled();
  });
  it("missing authoritative actor metadata cannot expose governance controls", async () => {
    const client = await mount();
    api.history.mockResolvedValue({ ...page(), actorId: undefined });
    await refresh(client);
    await waitFor(() => expect(screen.queryByLabelText("Policy status")).toBeNull());
    expect(screen.queryByRole("button", { name: "Preview status change" })).toBeNull();
    expect(api.set).not.toHaveBeenCalled();
  });
  it("pending same-actor read preserves draft and confirmation until it settles", async () => {
    const client = await mount();
    draft();
    await screen.findByRole("alertdialog");
    let resolve!: (value: ReturnType<typeof page>) => void;
    api.history.mockReturnValue(
      new Promise<ReturnType<typeof page>>((r) => {
        resolve = r;
      }),
    );
    let request!: Promise<void>;
    act(() => {
      request = client.invalidateQueries({ queryKey: key });
    });
    await waitFor(() => expect(client.isFetching()).toBeGreaterThan(0));
    expect(screen.getByLabelText("Reason")).toHaveProperty(
      "value",
      "SYNTHETIC private admin draft reason",
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await act(async () => {
      resolve(page());
      await request;
    });
    expect(screen.getByLabelText("Reason")).toHaveProperty(
      "value",
      "SYNTHETIC private admin draft reason",
    );
    expect(api.set).not.toHaveBeenCalled();
  });
});
