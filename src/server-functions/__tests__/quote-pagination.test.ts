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
    requireSession: vi.fn(),
    listQuotesPage: vi.fn(),
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => mocks.createServerFnChain,
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: mocks.requireCapability,
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
    mocks.requireCapability.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.listQuotesPage.mockResolvedValue({ items: [], total: 0, page: 2, limit: 25 });
  });

  it("authorizes, checks the session, and forwards quote pagination inputs", async () => {
    const { getQuotesPage } = await import("../quotes");

    await getQuotesPage({ data: pageData });

    expect(mocks.requireCapability).toHaveBeenCalledWith("quotes.view");
    expect(mocks.requireSession).toHaveBeenCalledOnce();
    expect(mocks.listQuotesPage).toHaveBeenCalledWith(pageData);
    expect(mocks.requireCapability.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listQuotesPage.mock.invocationCallOrder[0],
    );
    expect(mocks.requireSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listQuotesPage.mock.invocationCallOrder[0],
    );
  });

  it("does not read quote pages when session validation fails", async () => {
    mocks.requireSession.mockRejectedValueOnce(new Error("Unauthorized"));
    const { getQuotesPage } = await import("../quotes");

    await expect(getQuotesPage({ data: pageData })).rejects.toThrow("Unauthorized");
    expect(mocks.listQuotesPage).not.toHaveBeenCalled();
  });
});
