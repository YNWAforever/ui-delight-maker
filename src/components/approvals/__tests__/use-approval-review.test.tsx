// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminError } from "@/lib/admin/errors";
import { crmQueryKeys } from "@/lib/query-keys";
import {
  useApprovalReview,
  type ApprovalReviewRecord,
  type ReviewIntent,
  type ReviewPreparation,
} from "../use-approval-review";

const calls = vi.hoisted(() => ({
  decide: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("@/server-functions/approvals", () => ({
  decideApproval: calls.decide,
  getApprovalDetailFn: calls.detail,
}));
vi.mock("@/server-functions/quotes", () => ({
  approveQuote: calls.approve,
  rejectQuote: calls.reject,
}));
const id = "11111111-1111-4111-8111-111111111111",
  quoteId = "22222222-2222-4222-8222-222222222222";
const pendingKey = [...crmQueryKeys.approvals.lists(), "pending", "all"];
const historyKey = [...crmQueryKeys.approvals.lists(), "history", "all"];
function record(patch: Partial<ApprovalReviewRecord> = {}): ApprovalReviewRecord {
  return {
    id,
    agent_run_id: null,
    approval_type: "qualification_review",
    requested_by: "synthetic-actor",
    assigned_to: "synthetic-reviewer",
    status: "pending",
    row_version: 7,
    superseded_by: null,
    context_data: { synthetic: "visible" },
    context_summary: "Visible summary",
    reviewer_notes: "Earlier notes",
    decided_at: null,
    created_at: "2026-10-01T08:00:00.000Z",
    ...patch,
  };
}
const committed = () =>
  record({
    status: "approved",
    row_version: 8,
    reviewer_notes: null,
    decided_at: "2026-10-01T08:01:00.000Z",
  });
function intent(patch: Partial<ReviewIntent> = {}): ReviewIntent {
  return {
    record: record(),
    decision: "approved",
    availability: { blockedReason: null },
    ...patch,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function ready(preparation: ReviewPreparation) {
  expect(preparation.kind).toBe("ready");
  if (preparation.kind !== "ready") throw Error("Expected ready preparation");
  return preparation;
}
function mount(kind: "approvals" | "ai-review" = "approvals") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const unrelated = record({ id: "33333333-3333-4333-8333-333333333333" });
  const page = {
    items: [record(), unrelated],
    counts: { pending: 42, history: 10 },
    nextCursor: "synthetic-cursor",
  };
  client.setQueryData(pendingKey, page);
  const hook = renderHook(
    () =>
      useApprovalReview(
        kind === "approvals"
          ? { kind, pendingQueryKey: pendingKey, historyQueryKey: historyKey }
          : { kind },
      ),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { ...hook, client, page };
}
const cachedRow = (client: QueryClient) =>
  client.getQueryData<{ items: ApprovalReviewRecord[] }>(pendingKey)?.items[0];
beforeEach(() => {
  calls.decide.mockReset().mockResolvedValue(committed());
  calls.approve
    .mockReset()
    .mockResolvedValue({ id: quoteId, status: "approved", row_version: 999 });
  calls.reject.mockReset().mockResolvedValue({ id: quoteId, status: "rejected", row_version: 999 });
  calls.detail.mockReset().mockResolvedValue(committed());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("approval review public preparation and command contract", () => {
  it("prepare is inert and abandoning confirmation has no write or cache effect", () => {
    const h = mount();
    ready(h.result.current.prepare(intent()));
    expect(h.client.getQueryData(pendingKey)).toEqual(h.page);
    expect(calls.decide).not.toHaveBeenCalled();
    expect(calls.approve).not.toHaveBeenCalled();
    expect(calls.reject).not.toHaveBeenCalled();
    expect(h.result.current.busy).toBe(false);
    expect(h.result.current.confirmed.size).toBe(0);
  });
  it.each([undefined, -1, 1.5, NaN])(
    "blocks invalid version %s rather than defaulting to zero",
    (version) => {
      const h = mount();
      const r = record({ row_version: version as number });
      expect(h.result.current.prepare(intent({ record: r })).kind).toBe("blocked");
      expect(calls.decide).not.toHaveBeenCalled();
    },
  );
  it("honors a blocked advisory without treating allowed advice as authorization", () => {
    const h = mount();
    expect(
      h.result.current.prepare(intent({ availability: { blockedReason: "Ask your reviewer." } })),
    ).toEqual({ kind: "blocked", reason: "Ask your reviewer." });
    expect(calls.decide).not.toHaveBeenCalled();
  });
  it("freezes notes and version while the dialog is open", async () => {
    const h = mount();
    const value = intent({ notes: "  checked  " });
    const p = ready(h.result.current.prepare(value));
    value.notes = "changed";
    value.record.row_version = 8;
    await act(async () => {
      await p.confirm();
    });
    expect(calls.decide).toHaveBeenCalledWith({
      data: {
        id,
        decision: "approved",
        notes: "checked",
        expectedVersion: 7,
        idempotencyKey: expect.any(String),
      },
    });
  });
  it("same-tick confirm writes once and a repeated completed callback does not write again", async () => {
    const h = mount(),
      d = deferred<ApprovalReviewRecord>();
    calls.decide.mockReturnValue(d.promise);
    const p = ready(h.result.current.prepare(intent()));
    let first!: ReturnType<typeof p.confirm>, second;
    await act(async () => {
      first = p.confirm();
      second = await p.confirm();
    });
    expect(second).toEqual({ kind: "busy", approvalId: id });
    expect(calls.decide).toHaveBeenCalledTimes(1);
    expect(h.result.current.busy).toBe(true);
    expect(h.result.current.decidingIds.has(id)).toBe(true);
    await act(async () => {
      d.resolve(committed());
      await first;
      await p.confirm();
    });
    expect(calls.decide).toHaveBeenCalledTimes(1);
    expect(h.result.current.busy).toBe(false);
  });
  it.each(["approved", "rejected"] as const)(
    "quote %s carries original metadata and never issues",
    async (decision) => {
      const h = mount();
      calls.detail.mockResolvedValue(record({ status: decision, row_version: 8 }));
      const p = ready(
        h.result.current.prepare(
          intent({
            record: record({ approval_type: "quote_send", quote_id: quoteId }),
            decision,
            notes: " checked ",
          }),
        ),
      );
      await act(async () => {
        await p.confirm();
      });
      const fn = decision === "approved" ? calls.approve : calls.reject;
      expect(fn).toHaveBeenCalledWith({
        data: {
          id: quoteId,
          approvalId: id,
          notes: "checked",
          expectedVersion: 7,
          idempotencyKey: expect.any(String),
        },
      });
      expect(calls.decide).not.toHaveBeenCalled();
      expect(h.result.current.confirmed.get(id)?.row_version).toBe(8);
    },
  );
  it("quote request changes uses generic decision and its context quote reference", async () => {
    const h = mount();
    const p = ready(
      h.result.current.prepare(
        intent({
          record: record({ approval_type: "quote_send", context_data: { quote_id: quoteId } }),
          decision: "escalated",
        }),
      ),
    );
    expect(p.description).toMatch(/stays parked/i);
    await act(async () => {
      await p.confirm();
    });
    expect(calls.decide).toHaveBeenCalledWith({
      data: expect.objectContaining({
        decision: "escalated",
        expectedVersion: 7,
        idempotencyKey: expect.any(String),
      }),
    });
    expect(calls.approve).not.toHaveBeenCalled();
    expect(calls.reject).not.toHaveBeenCalled();
  });
  it.each([undefined, "not-a-uuid"])(
    "blocks missing/malformed quote %s with no generic fallback",
    (value) => {
      const h = mount();
      expect(
        h.result.current.prepare(
          intent({
            record: record({
              approval_type: "quote_send",
              context_data: { quote_id: value as string },
            }),
          }),
        ).kind,
      ).toBe("blocked");
      expect(calls.decide).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["quote_send", "separate authorized action"],
    ["message_send", "does not send"],
    ["discount", "No pricing change"],
    ["qualification_review", "lead score was already written"],
    ["campaign_send", "No campaign is dispatched"],
    ["forecast_review", "No forecast is rewritten"],
    ["cs_risk_review", "health score"],
  ] as const)("keeps truthful proposed effect for %s", (type, text) => {
    const h = mount();
    const p = ready(
      h.result.current.prepare(
        intent({ record: record({ approval_type: type, quote_id: quoteId }) }),
      ),
    );
    expect(p.description).toContain(text);
  });
});

describe("adapter timing and safe cache aftermath", () => {
  it("optimistically patches only the target row without computing counts", async () => {
    const h = mount(),
      d = deferred<ApprovalReviewRecord>();
    calls.decide.mockReturnValue(d.promise);
    const p = ready(h.result.current.prepare(intent()));
    let work!: ReturnType<typeof p.confirm>;
    await act(async () => {
      work = p.confirm();
    });
    const page = h.client.getQueryData<typeof h.page>(pendingKey)!;
    expect(page.items[0].status).toBe("approved");
    expect(page.items[0].reviewer_notes).toBeNull();
    expect(page.items[1]).toEqual(h.page.items[1]);
    expect(page.counts).toEqual({ pending: 42, history: 10 });
    expect(h.result.current.confirmed.size).toBe(0);
    await act(async () => {
      d.resolve(committed());
      await work;
    });
    expect(h.result.current.confirmed.get(id)?.row_version).toBe(8);
  });
  it("AI adapter leaves status and notes unchanged until actual server success", async () => {
    const h = mount("ai-review"),
      d = deferred<ApprovalReviewRecord>();
    calls.decide.mockReturnValue(d.promise);
    const p = ready(h.result.current.prepare(intent()));
    let work!: ReturnType<typeof p.confirm>;
    await act(async () => {
      work = p.confirm();
    });
    expect(cachedRow(h.client)).toEqual(h.page.items[0]);
    expect(h.result.current.confirmed.size).toBe(0);
    await act(async () => {
      d.resolve(committed());
      await work;
    });
    expect(h.result.current.confirmed.get(id)?.status).toBe("approved");
  });
  it("rolls back its own optimistic row for a recognizable business rejection", async () => {
    const h = mount();
    calls.decide.mockRejectedValue(new AdminError("FORBIDDEN", "You do not have access."));
    calls.detail.mockResolvedValue(record());
    let outcome;
    await act(async () => {
      outcome = await ready(h.result.current.prepare(intent())).confirm();
    });
    expect(outcome).toMatchObject({ kind: "not-recorded", approvalId: id });
    expect(cachedRow(h.client)).toEqual(h.page.items[0]);
    expect(h.result.current.confirmed.size).toBe(0);
  });
  it("rollback preserves a newer refetched assignment and version", async () => {
    const h = mount(),
      d = deferred<ApprovalReviewRecord>();
    calls.decide.mockReturnValue(d.promise);
    const p = ready(h.result.current.prepare(intent()));
    let work!: ReturnType<typeof p.confirm>;
    await act(async () => {
      work = p.confirm();
    });
    const newer = record({ row_version: 8, assigned_to: "new-reviewer" });
    h.client.setQueryData(pendingKey, { ...h.page, items: [newer, h.page.items[1]] });
    calls.detail.mockResolvedValue(newer);
    await act(async () => {
      d.reject(new AdminError("STALE_ADMIN_STATE", "Refresh this approval."));
      await work;
    });
    expect(cachedRow(h.client)).toEqual(newer);
    expect(h.result.current.confirmed.size).toBe(0);
  });
  it("recorded result survives failed refresh and does not roll back or resend", async () => {
    const h = mount();
    vi.spyOn(h.client, "invalidateQueries").mockRejectedValue(new Error("Fetch failed"));
    let outcome;
    await act(async () => {
      outcome = await ready(h.result.current.prepare(intent())).confirm();
    });
    expect(outcome).toEqual({ kind: "recorded", approvalId: id, refreshFailed: true });
    expect(h.result.current.confirmed.get(id)?.status).toBe("approved");
    expect(calls.decide).toHaveBeenCalledTimes(1);
  });
  it("quote read grant failure after write retains safe recorded status without borrowing quote version", async () => {
    const h = mount("ai-review");
    calls.detail.mockRejectedValue(new AdminError("FORBIDDEN", "Not authorized"));
    let outcome;
    await act(async () => {
      outcome = await ready(
        h.result.current.prepare(
          intent({ record: record({ approval_type: "quote_send", quote_id: quoteId }) }),
        ),
      ).confirm();
    });
    expect(outcome).toEqual({ kind: "recorded", approvalId: id, refreshFailed: true });
    expect(h.result.current.confirmed.get(id)?.row_version).toBe(7);
    expect(calls.approve).toHaveBeenCalledTimes(1);
  });
  it("uses submitted visible notes instead of raw decision reply content", async () => {
    const h = mount("ai-review");
    calls.decide.mockResolvedValue({
      ...committed(),
      reviewer_notes: "synthetic-unrequested-content",
      context_summary: "synthetic-unrequested-content",
    });
    await act(async () => {
      await ready(h.result.current.prepare(intent({ notes: "checked" }))).confirm();
    });
    expect(h.result.current.confirmed.get(id)?.reviewer_notes).toBe("checked");
    expect(h.result.current.confirmed.get(id)?.context_summary).toBe("Visible summary");
  });
  it("restricted reply stays redacted and cannot introduce raw ownership", async () => {
    const h = mount("ai-review");
    const restricted = record({
      subject_restricted: true,
      context_data: null,
      context_summary: null,
      reviewer_notes: null,
    });
    calls.decide.mockResolvedValue({
      ...committed(),
      context_data: { secret: "synthetic-restricted-secret" },
      context_summary: "synthetic-restricted-secret",
      reviewer_notes: "synthetic-restricted-secret",
      owner_profile_id: "private-owner",
    });
    await act(async () => {
      await ready(h.result.current.prepare(intent({ record: restricted }))).confirm();
    });
    const r = h.result.current.confirmed.get(id)!;
    expect(r.context_data).toBeNull();
    expect(r.context_summary).toBeNull();
    expect(r.reviewer_notes).toBeNull();
    expect(r).not.toHaveProperty("owner_profile_id");
  });
  it("unmounting an in-flight hook does not create another write or poison the next mount", async () => {
    const h = mount(),
      d = deferred<ApprovalReviewRecord>();
    calls.decide.mockReturnValue(d.promise);
    const p = ready(h.result.current.prepare(intent()));
    let work!: ReturnType<typeof p.confirm>;
    await act(async () => {
      work = p.confirm();
    });
    h.unmount();
    d.resolve(committed());
    await work;
    await p.confirm();
    expect(calls.decide).toHaveBeenCalledTimes(1);
    const next = mount();
    expect(next.result.current.busy).toBe(false);
    expect(next.result.current.confirmed.size).toBe(0);
  });
});

describe("uncertain results and explicit retry", () => {
  it("unresolved replay keeps exact key/version/notes and blocks an altered intent", async () => {
    const h = mount();
    calls.decide
      .mockRejectedValueOnce(new TypeError("Fetch failed"))
      .mockResolvedValueOnce(committed());
    calls.detail.mockResolvedValue(record());
    let outcome;
    await act(async () => {
      outcome = await ready(h.result.current.prepare(intent({ notes: " checked " }))).confirm();
    });
    expect(outcome).toMatchObject({ kind: "unconfirmed" });
    expect(h.result.current.confirmed.size).toBe(0);
    const first = calls.decide.mock.calls[0][0];
    expect(h.result.current.prepare(intent({ notes: "changed" })).kind).toBe("blocked");
    expect(h.result.current.prepare(intent({ decision: "rejected", notes: "checked" })).kind).toBe(
      "blocked",
    );
    await act(async () => {
      await ready(h.result.current.prepare(intent({ notes: "checked" }))).confirm();
    });
    expect(calls.decide).toHaveBeenCalledTimes(2);
    expect(calls.decide.mock.calls[1][0]).toEqual(first);
  });
  it("unknown error text containing FORBIDDEN stays unconfirmed and hides driver details", async () => {
    const h = mount();
    calls.decide.mockRejectedValue(
      new Error("FORBIDDEN: duplicate key violates private_constraint"),
    );
    calls.detail.mockRejectedValue(new TypeError("Fetch failed"));
    let outcome;
    await act(async () => {
      outcome = await ready(h.result.current.prepare(intent())).confirm();
    });
    expect(outcome).toMatchObject({ kind: "unconfirmed" });
    expect(JSON.stringify(outcome)).not.toContain("private_constraint");
    expect(calls.decide).toHaveBeenCalledTimes(1);
  });
});

describe("captured surface and persisted version", () => {
  it("keeps an old response inside its captured filter page", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const oldPage = { items: [record()], counts: { pending: 42 } },
      newKey = [...pendingKey, "other-filter"];
    const newPage = {
      items: [record({ context_summary: "New filter row" })],
      counts: { pending: 9 },
    };
    client.setQueryData(pendingKey, oldPage);
    client.setQueryData(newKey, newPage);
    const h = renderHook(
      ({ key }) =>
        useApprovalReview({ kind: "approvals", pendingQueryKey: key, historyQueryKey: historyKey }),
      {
        initialProps: { key: pendingKey },
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    const p = ready(h.result.current.prepare(intent())),
      d = deferred<ApprovalReviewRecord>();
    calls.decide.mockReturnValue(d.promise);
    let work!: ReturnType<typeof p.confirm>;
    await act(async () => {
      work = p.confirm();
    });
    h.rerender({ key: newKey });
    await act(async () => {
      d.resolve(committed());
      await work;
    });
    expect(client.getQueryData(newKey)).toEqual(newPage);
    expect(
      client.getQueryData<{ items: ApprovalReviewRecord[] }>(pendingKey)?.items[0].status,
    ).toBe("approved");
  });
  it("sends the prepared version7 after a refetch to8 and preserves the newer row on conflict", async () => {
    const h = mount(),
      p = ready(h.result.current.prepare(intent()));
    const newer = record({ row_version: 8, assigned_to: "new-reviewer" });
    h.client.setQueryData(pendingKey, { ...h.page, items: [newer, h.page.items[1]] });
    calls.decide.mockRejectedValue(new AdminError("STALE_ADMIN_STATE", "Refresh this approval."));
    calls.detail.mockResolvedValue(newer);
    await act(async () => {
      await p.confirm();
    });
    expect(calls.decide.mock.calls[0][0].data.expectedVersion).toBe(7);
    expect(cachedRow(h.client)).toEqual(newer);
  });
  it("recognizes the typed serialized AdminError contract without substring heuristics", async () => {
    const h = mount();
    calls.decide.mockRejectedValue({
      name: "AdminError",
      code: "FORBIDDEN",
      message: "You do not have access.",
    });
    calls.detail.mockResolvedValue(record());
    let outcome;
    await act(async () => {
      outcome = await ready(h.result.current.prepare(intent())).confirm();
    });
    expect(outcome).toMatchObject({ kind: "not-recorded" });
    expect(cachedRow(h.client)).toEqual(h.page.items[0]);
  });
});
