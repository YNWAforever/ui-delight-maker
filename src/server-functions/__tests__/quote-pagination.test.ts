import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    createServerFnChain,
    requireCapability: vi.fn(),
    requireCapabilitySet: vi.fn(),
    requireSession: vi.fn(),
    listQuotesPage: vi.fn(),
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => mocks.createServerFnChain,
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: mocks.requireCapability,
  requireCapabilitySet: mocks.requireCapabilitySet,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: mocks.requireSession,
}));

vi.mock("@/server/repositories/quote-templates", () => ({
  listQuoteTemplates: vi.fn(),
  listPdfTemplates: vi.fn(),
}));

vi.mock("@/server/repositories/quote-versions", () => ({
  createQuoteVersion: vi.fn(),
  listQuoteVersions: vi.fn(),
}));

vi.mock("@/server/repositories/job-sheets", () => ({
  createJobSheetFromAcceptedQuote: vi.fn(),
}));

vi.mock("@/server/repositories/quotes", () => ({
  createQuote: vi.fn(),
  getQuote: vi.fn(),
  listActivePricingTemplates: vi.fn(),
  listQuoteLineItems: vi.fn(),
  listQuotes: vi.fn(),
  listQuotesPage: mocks.listQuotesPage,
  updateQuote: vi.fn(),
  updateQuoteLifecycle: vi.fn(),
}));

vi.mock("@/server/repositories/approvals", () => ({
  decideApproval: vi.fn(),
  getApproval: vi.fn(),
}));

const pageData = {
  status: "sent",
  lead_id: "lead-1",
  client_id: "client-1",
  contact_id: "contact-1",
  account_id: "account-1",
  deal_id: "deal-1",
  page: 2,
  limit: 25,
};

describe("paginated quote server function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCapabilitySet.mockResolvedValue({
      "quotes.view": true,
      "leads.view": true,
      "accounts.view": true,
    });
    mocks.listQuotesPage.mockResolvedValue({ items: [], total: 0, page: 2, limit: 25 });
  });

  it("authorizes, resolves linked-record visibility in one load, and forwards it to the query", async () => {
    const { getQuotesPage } = await import("../quotes");

    const result = await getQuotesPage({ data: pageData });

    expect(mocks.requireCapabilitySet).toHaveBeenCalledWith(["quotes.view"], {
      optional: ["leads.view", "accounts.view"],
    });
    expect(mocks.listQuotesPage).toHaveBeenCalledWith({
      ...pageData,
      visibility: { leads: true, clients: true },
    });
    expect(mocks.requireCapabilitySet.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listQuotesPage.mock.invocationCallOrder[0],
    );
    // The client needs to tell a redacted name from a genuinely absent one.
    expect(result).toEqual({
      items: [],
      total: 0,
      page: 2,
      limit: 25,
      visibility: { leads: true, clients: true },
    });
  });

  it("resolves clients visibility from accounts.view and leaves leads redacted when denied", async () => {
    mocks.requireCapabilitySet.mockResolvedValue({
      "quotes.view": true,
      "leads.view": false,
      "accounts.view": true,
    });
    const { getQuotesPage } = await import("../quotes");

    await getQuotesPage({ data: pageData });

    expect(mocks.listQuotesPage).toHaveBeenCalledWith({
      ...pageData,
      visibility: { leads: false, clients: true },
    });
  });

  it("does not read quote pages when authorization fails", async () => {
    mocks.requireCapabilitySet.mockRejectedValueOnce(new Error("Unauthorized"));
    const { getQuotesPage } = await import("../quotes");

    await expect(getQuotesPage({ data: pageData })).rejects.toThrow("Unauthorized");
    expect(mocks.listQuotesPage).not.toHaveBeenCalled();
  });
});
