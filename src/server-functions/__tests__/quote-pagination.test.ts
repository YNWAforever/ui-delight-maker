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
    requirePageAuthorization: vi.fn(),
    rowsAllow: vi.fn(),
    requireSession: vi.fn(),
    listQuotesPage: vi.fn(),
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => mocks.createServerFnChain,
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: mocks.requireCapability,
  requirePageAuthorization: mocks.requirePageAuthorization,
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

/** A minimal quote row: only the fields getQuotesPage's redaction logic reads. */
function row(overrides: {
  id: string;
  lead_id?: string | null;
  client_id?: string | null;
  linked_company_name?: string | null;
}) {
  return {
    lead_id: null,
    client_id: null,
    linked_company_name: null,
    ...overrides,
  };
}

function setAccess(access: Partial<Record<"leads.view" | "accounts.view", boolean>>) {
  mocks.requirePageAuthorization.mockResolvedValue({
    access: { "quotes.view": true, ...access },
    rows: { allow: mocks.rowsAllow },
  });
}

describe("paginated quote server function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAccess({ "leads.view": true, "accounts.view": true });
    mocks.listQuotesPage.mockResolvedValue({ items: [], total: 0, page: 2, limit: 25 });
    mocks.rowsAllow.mockResolvedValue(new Map());
  });

  it("authorizes once, then forwards capability-level search scope to the query", async () => {
    const { getQuotesPage } = await import("../quotes");

    const result = await getQuotesPage({ data: pageData });

    expect(mocks.requirePageAuthorization).toHaveBeenCalledWith(["quotes.view"], {
      optional: ["leads.view", "accounts.view"],
    });
    expect(mocks.listQuotesPage).toHaveBeenCalledWith({
      ...pageData,
      searchScope: { leads: true, clients: true },
    });
    expect(mocks.requirePageAuthorization.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listQuotesPage.mock.invocationCallOrder[0],
    );
    // No page-level pair any more — an empty page has nothing to redact, so no row decision
    // is even attempted, and the response carries only what the repository returned.
    expect(result).toEqual({ items: [], total: 0, page: 2, limit: 25 });
  });

  it("resolves clients search scope from accounts.view and leaves leads out of scope when denied", async () => {
    setAccess({ "leads.view": false, "accounts.view": true });
    const { getQuotesPage } = await import("../quotes");

    await getQuotesPage({ data: pageData });

    expect(mocks.listQuotesPage).toHaveBeenCalledWith({
      ...pageData,
      searchScope: { leads: false, clients: true },
    });
  });

  it("does not read quote pages when authorization fails", async () => {
    mocks.requirePageAuthorization.mockRejectedValueOnce(new Error("Unauthorized"));
    const { getQuotesPage } = await import("../quotes");

    await expect(getQuotesPage({ data: pageData })).rejects.toThrow("Unauthorized");
    expect(mocks.listQuotesPage).not.toHaveBeenCalled();
  });

  it("resolves ownership for lead- and client-linked rows and redacts what ownership denies", async () => {
    setAccess({ "leads.view": true, "accounts.view": true });
    mocks.listQuotesPage.mockResolvedValue({
      items: [
        row({ id: "q-lead-allowed", lead_id: "lead-1", linked_company_name: "Zephyr" }),
        row({ id: "q-lead-denied", lead_id: "lead-2", linked_company_name: "Meridian" }),
        row({ id: "q-client-allowed", client_id: "client-1", linked_company_name: "Halcyon" }),
      ],
      total: 3,
      page: 1,
      limit: 50,
    });
    mocks.rowsAllow.mockImplementation(
      async (capability: string, resourceType: string, ids: string[]) => {
        if (resourceType === "lead") {
          return new Map(ids.map((id) => [id, id === "lead-1"]));
        }
        if (resourceType === "client") {
          return new Map(ids.map((id) => [id, true]));
        }
        return new Map();
      },
    );
    const { getQuotesPage } = await import("../quotes");

    const result = await getQuotesPage({ data: pageData });

    expect(mocks.rowsAllow).toHaveBeenCalledWith("leads.view", "lead", ["lead-1", "lead-2"]);
    expect(mocks.rowsAllow).toHaveBeenCalledWith("accounts.view", "client", ["client-1"]);
    expect(result.items).toEqual([
      {
        id: "q-lead-allowed",
        lead_id: "lead-1",
        client_id: null,
        linked_company_name: "Zephyr",
        linked_record_restricted: false,
      },
      {
        id: "q-lead-denied",
        lead_id: "lead-2",
        client_id: null,
        linked_company_name: null,
        linked_record_restricted: true,
      },
      {
        id: "q-client-allowed",
        lead_id: null,
        client_id: "client-1",
        linked_company_name: "Halcyon",
        linked_record_restricted: false,
      },
    ]);
  });

  it("redacts every lead-linked row and skips the ownership query when leads.view is denied outright", async () => {
    // Capability-level denial redacts unconditionally — cheaper than an ownership query, and
    // matches the detail page's own short-circuit.
    setAccess({ "leads.view": false, "accounts.view": true });
    mocks.listQuotesPage.mockResolvedValue({
      items: [row({ id: "q-lead-1", lead_id: "lead-1", linked_company_name: "Zephyr" })],
      total: 1,
      page: 1,
      limit: 50,
    });
    const { getQuotesPage } = await import("../quotes");

    const result = await getQuotesPage({ data: pageData });

    expect(mocks.rowsAllow).not.toHaveBeenCalledWith("leads.view", "lead", expect.anything());
    expect(result.items).toEqual([
      {
        id: "q-lead-1",
        lead_id: "lead-1",
        client_id: null,
        linked_company_name: null,
        linked_record_restricted: true,
      },
    ]);
  });

  it("skips the ownership query entirely when no row on the page carries that link", async () => {
    setAccess({ "leads.view": true, "accounts.view": true });
    mocks.listQuotesPage.mockResolvedValue({
      items: [row({ id: "q-client-only", client_id: "client-1", linked_company_name: "Halcyon" })],
      total: 1,
      page: 1,
      limit: 50,
    });
    mocks.rowsAllow.mockResolvedValue(new Map([["client-1", true]]));
    const { getQuotesPage } = await import("../quotes");

    await getQuotesPage({ data: pageData });

    expect(mocks.rowsAllow).not.toHaveBeenCalledWith("leads.view", "lead", expect.anything());
    expect(mocks.rowsAllow).toHaveBeenCalledTimes(1);
  });

  it("lets a client win over a lead on the same quote, matching the route's display precedence", async () => {
    // Only the client-side decision should be consulted for a quote carrying both ids —
    // `linkedRecord` in src/routes/quotes.tsx never renders the lead in that case.
    setAccess({ "leads.view": true, "accounts.view": true });
    mocks.listQuotesPage.mockResolvedValue({
      items: [
        row({
          id: "q-both",
          lead_id: "lead-1",
          client_id: "client-1",
          linked_company_name: "Halcyon",
        }),
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    mocks.rowsAllow.mockImplementation(async (_capability: string, resourceType: string) =>
      resourceType === "client" ? new Map([["client-1", true]]) : new Map([["lead-1", false]]),
    );
    const { getQuotesPage } = await import("../quotes");

    const result = await getQuotesPage({ data: pageData });

    expect(result.items[0]).toMatchObject({
      linked_company_name: "Halcyon",
      linked_record_restricted: false,
    });
  });

  it("leaves an unlinked quote's row untouched and not restricted", async () => {
    mocks.listQuotesPage.mockResolvedValue({
      items: [row({ id: "q-unlinked" })],
      total: 1,
      page: 1,
      limit: 50,
    });
    const { getQuotesPage } = await import("../quotes");

    const result = await getQuotesPage({ data: pageData });

    expect(result.items).toEqual([
      {
        id: "q-unlinked",
        lead_id: null,
        client_id: null,
        linked_company_name: null,
        linked_record_restricted: false,
      },
    ]);
    expect(mocks.rowsAllow).not.toHaveBeenCalled();
  });
});
