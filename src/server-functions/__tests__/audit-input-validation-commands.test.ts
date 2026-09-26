import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  requireNeonAuthSession: vi.fn(),
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
  decideApproval: vi.fn(),
  replaceJobSheetPortions: vi.fn(),
  updateJobSheetXeroReference: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const chain = {
      validator(validator: (data: unknown) => unknown) {
        validate = validator;
        return chain;
      },
      handler<T extends ({ data }: { data: never }) => unknown>(handler: T) {
        return async ({ data }: { data: unknown }) => handler({ data: validate(data) } as never);
      },
    };
    return chain;
  },
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: mocks.requireCapability,
}));
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: mocks.requireNeonAuthSession,
}));
vi.mock("@/server/repositories/quotes", () => ({
  createQuote: mocks.createQuote,
  updateQuote: mocks.updateQuote,
  getQuote: vi.fn(),
  listQuotes: vi.fn(),
  listQuotesPage: vi.fn(),
  listActivePricingTemplates: vi.fn(),
  listQuoteLineItems: vi.fn(),
  updateQuoteLifecycle: vi.fn(),
}));
vi.mock("@/server/repositories/approvals", () => ({
  decideApproval: mocks.decideApproval,
  assignApproval: vi.fn(),
  listApprovals: vi.fn(),
  createApproval: vi.fn(),
  findPendingApprovalForQuote: vi.fn(),
  getApproval: vi.fn(),
}));
vi.mock("@/server/repositories/job-sheets", () => ({
  replaceJobSheetPortions: mocks.replaceJobSheetPortions,
  updateJobSheetXeroReference: mocks.updateJobSheetXeroReference,
  acceptJobSheet: vi.fn(),
  getJobSheet: vi.fn(),
  listJobSheets: vi.fn(),
  listJobSheetsPage: vi.fn(),
  createJobSheetFromAcceptedQuote: vi.fn(),
}));
vi.mock("@/server/workflows/decide-risk-review.server", () => ({
  applyRiskReviewDecision: vi.fn(),
}));
vi.mock("@/lib/serializable", () => ({
  serializeHumanApproval: (value: unknown) => value,
  serializeAgentRun: (value: unknown) => value,
}));

import {
  approveQuote,
  createQuote,
  rejectQuote,
  requestQuoteApproval,
  updateQuote,
} from "../quotes";
import { decideApproval } from "../approvals";
import {
  acceptJobSheetForAccounting,
  updateJobSheetPortions,
  updatePortionXeroReference,
} from "../job-sheets";

const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCapability.mockResolvedValue(undefined);
  mocks.requireNeonAuthSession.mockResolvedValue({ profile: { id: ID } });
  mocks.createQuote.mockResolvedValue({ id: ID });
  mocks.updateQuote.mockResolvedValue({ id: ID });
  mocks.decideApproval.mockResolvedValue({ id: ID, status: "approved" });
  mocks.replaceJobSheetPortions.mockResolvedValue([]);
  mocks.updateJobSheetXeroReference.mockResolvedValue({ id: ID });
});

describe("commercial and approval input boundaries", () => {
  it("rejects a negative quote value before repository access", async () => {
    await expect(
      updateQuote({ data: { id: ID, updates: { total_value: -1 } } }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: { "updates.total_value": expect.any(Array) },
    });
    expect(mocks.updateQuote).not.toHaveBeenCalled();
  });

  it("rejects non-finite quote money before repository access", async () => {
    await expect(
      createQuote({ data: { lead_id: ID, currency: "HKD", total_value: Number.NaN } }),
    ).rejects.toThrow();
    expect(mocks.createQuote).not.toHaveBeenCalled();
  });

  it("rejects a quote patch that smuggles an unknown field", async () => {
    await expect(updateQuote({ data: { id: ID, updates: { is_admin: true } } })).rejects.toThrow();
    expect(mocks.updateQuote).not.toHaveBeenCalled();
  });

  it("rejects an unknown approval decision before repository access", async () => {
    await expect(decideApproval({ data: { id: ID, decision: "reopened" } })).rejects.toThrow();
    expect(mocks.decideApproval).not.toHaveBeenCalled();
  });

  it("rejects approval notes above the contract limit", async () => {
    await expect(
      decideApproval({ data: { id: ID, decision: "approved", notes: "x".repeat(10_001) } }),
    ).rejects.toThrow();
    expect(mocks.decideApproval).not.toHaveBeenCalled();
  });

  it("rejects a non-finite billing portion amount before repository access", async () => {
    await expect(
      updateJobSheetPortions({
        data: {
          id: ID,
          portions: [
            {
              name: "Deposit",
              source_quote_line_item_ids: [],
              description: "",
              amount: Number.POSITIVE_INFINITY,
              currency: "HKD",
              billing_type: "deposit",
              status: "planned",
              sort_order: 0,
            },
          ],
        },
      }),
    ).rejects.toThrow();
    expect(mocks.replaceJobSheetPortions).not.toHaveBeenCalled();
  });

  it("rejects an oversized Xero note before repository access", async () => {
    await expect(
      updatePortionXeroReference({ data: { portion_id: ID, xero_notes: "x".repeat(10_001) } }),
    ).rejects.toThrow();
    expect(mocks.updateJobSheetXeroReference).not.toHaveBeenCalled();
  });
});

describe("remaining write command input boundaries", () => {
  it("rejects an empty quote ID before approval", async () => {
    await expect(approveQuote({ data: { id: "" } })).rejects.toThrow();
    expect(mocks.requireCapability).not.toHaveBeenCalled();
  });

  it("rejects a malformed reviewer ID before requesting approval", async () => {
    await expect(requestQuoteApproval({ data: { id: ID, assignedTo: "no" } })).rejects.toThrow();
    expect(mocks.requireCapability).not.toHaveBeenCalled();
  });

  it("rejects excessive rejection notes before authorization or writes", async () => {
    await expect(rejectQuote({ data: { id: ID, notes: "x".repeat(10_001) } })).rejects.toThrow();
    expect(mocks.requireCapability).not.toHaveBeenCalled();
  });

  it("rejects an empty job sheet ID before acceptance", async () => {
    await expect(acceptJobSheetForAccounting({ data: { id: "" } })).rejects.toThrow();
    expect(mocks.requireCapability).not.toHaveBeenCalled();
  });
});
describe("existing quote editor payloads", () => {
  it("accepts a client line-item key that is not a database UUID", async () => {
    await createQuote({
      data: {
        lead_id: ID,
        currency: "HKD",
        line_items: [
          { id: "li-1-abc", service: "Planning", description: "", qty: 1, unit_price: 100.25 },
        ],
      },
    });
    expect(mocks.createQuote).toHaveBeenCalledOnce();
  });

  it("allows a draft copy to record its parent quote ID", async () => {
    await updateQuote({ data: { id: ID, updates: { parent_quote_id: ID } } });
    expect(mocks.updateQuote).toHaveBeenCalledOnce();
  });
});
it("rejects quote fields the current repository cannot persist", async () => {
  await expect(
    updateQuote({ data: { id: ID, updates: { currency: "USD" } } }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(mocks.updateQuote).not.toHaveBeenCalled();
});
