import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireCapabilityMock,
  loadRequestAuthorizationMock,
  requireNeonAuthSessionMock,
  createQuoteMock,
  getQuoteMock,
  updateQuoteMock,
  updateQuoteLifecycleMock,
  getApprovalMock,
  listQuoteLineItemsMock,
  listQuoteTemplatesMock,
  listPdfTemplatesMock,
  listQuoteVersionsMock,
  createQuoteVersionMock,
  createJobSheetFromAcceptedQuoteMock,
  decideApprovalMock,
  updateQuoteCommercialMock,
  createQuoteRevisionCommandMock,
  requestQuoteApprovalCommandMock,
  decideQuoteSendCommandMock,
  issueQuoteCommandMock,
  approveAndIssueQuoteCommandMock,
  acceptQuoteCommandMock,
  createServerFnChain,
} = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: unknown[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    requireCapabilityMock: vi.fn(),
    loadRequestAuthorizationMock: vi.fn(),
    requireNeonAuthSessionMock: vi.fn(),
    createQuoteMock: vi.fn(),
    getQuoteMock: vi.fn(),
    updateQuoteMock: vi.fn(),
    updateQuoteLifecycleMock: vi.fn(),
    getApprovalMock: vi.fn(),
    listQuoteLineItemsMock: vi.fn(),
    listQuoteTemplatesMock: vi.fn(),
    listPdfTemplatesMock: vi.fn(),
    listQuoteVersionsMock: vi.fn(),
    createQuoteVersionMock: vi.fn(),
    createJobSheetFromAcceptedQuoteMock: vi.fn(),
    decideApprovalMock: vi.fn(),
    updateQuoteCommercialMock: vi.fn(),
    createQuoteRevisionCommandMock: vi.fn(),
    requestQuoteApprovalCommandMock: vi.fn(),
    decideQuoteSendCommandMock: vi.fn(),
    issueQuoteCommandMock: vi.fn(),
    approveAndIssueQuoteCommandMock: vi.fn(),
    acceptQuoteCommandMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: requireCapabilityMock,
  loadRequestAuthorization: loadRequestAuthorizationMock,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));

vi.mock("@/server/repositories/quote-templates", () => ({
  listQuoteTemplates: listQuoteTemplatesMock,
  listPdfTemplates: listPdfTemplatesMock,
}));

vi.mock("@/server/repositories/quote-versions", () => ({
  createQuoteVersion: createQuoteVersionMock,
  listQuoteVersions: listQuoteVersionsMock,
}));

vi.mock("@/server/repositories/job-sheets", () => ({
  createJobSheetFromAcceptedQuote: createJobSheetFromAcceptedQuoteMock,
}));

vi.mock("@/server/repositories/quotes", () => ({
  getQuote: getQuoteMock,
  updateQuote: updateQuoteMock,
  updateQuoteLifecycle: updateQuoteLifecycleMock,
  listQuotes: vi.fn(),
  createQuote: createQuoteMock,
  listActivePricingTemplates: vi.fn(),
  listQuoteLineItems: listQuoteLineItemsMock,
}));

vi.mock("@/server/repositories/approvals", () => ({
  getApproval: getApprovalMock,
}));

vi.mock("@/server/commands/approval-decision.server", () => ({
  decideApprovalCommand: decideApprovalMock,
}));

vi.mock("@/server/commands/quote-lifecycle.server", () => ({
  requestQuoteApprovalCommand: requestQuoteApprovalCommandMock,
  decideQuoteSendCommand: decideQuoteSendCommandMock,
  issueQuoteCommand: issueQuoteCommandMock,
  approveAndIssueQuoteCommand: approveAndIssueQuoteCommandMock,
  acceptQuoteCommand: acceptQuoteCommandMock,
}));
vi.mock("@/server/commands/quote-revision.server", () => ({
  updateQuoteCommercial: updateQuoteCommercialMock,
  createQuoteRevision: createQuoteRevisionCommandMock,
}));

describe("quote server functions", () => {
  beforeEach(() => {
    requireNeonAuthSessionMock.mockReset();
    createQuoteMock.mockReset();
    getQuoteMock.mockReset();
    updateQuoteMock.mockReset();
    updateQuoteLifecycleMock.mockReset();
    getApprovalMock.mockReset();
    listQuoteLineItemsMock.mockReset();
    listQuoteTemplatesMock.mockReset();
    listPdfTemplatesMock.mockReset();
    listQuoteVersionsMock.mockReset();
    createQuoteVersionMock.mockReset();
    createJobSheetFromAcceptedQuoteMock.mockReset();
    decideApprovalMock.mockReset();
    updateQuoteCommercialMock.mockReset().mockResolvedValue({ id: "quote-1", total_value: 120000 });
    requestQuoteApprovalCommandMock.mockReset().mockResolvedValue({ id: "approval-1" });
    decideQuoteSendCommandMock.mockReset().mockResolvedValue({
      quote: { id: "quote-1", status: "approved" },
      approval: { id: "approval-1", status: "approved" },
    });
    issueQuoteCommandMock.mockReset().mockResolvedValue({
      quote: { id: "quote-1", status: "sent" },
      version: { id: "issued-1" },
    });
    approveAndIssueQuoteCommandMock.mockReset().mockResolvedValue({
      quote: { id: "quote-1", status: "sent" },
      version: { id: "issued-1" },
    });
    acceptQuoteCommandMock.mockReset().mockResolvedValue({
      quote: { id: "quote-1", status: "accepted" },
      jobSheet: { id: "sheet-1" },
    });
    createQuoteRevisionCommandMock.mockReset().mockResolvedValue({
      quote: { id: "revision-1", status: "revised" },
      version: { id: "version-2" },
    });
    loadRequestAuthorizationMock.mockReset().mockResolvedValue({
      session: { profile: { id: "user-1", role: "admin", status: "active" } },
      actor: { profileId: "user-1", role: "admin", status: "active" },
    });
    requireCapabilityMock.mockReset().mockResolvedValue({
      user: { id: "user-1" },
      profile: { id: "user-1", role: "sales", status: "active" },
      session: {},
    });

    requireNeonAuthSessionMock.mockResolvedValue({
      user: { id: "user-1" },
      profile: { id: "user-1", role: "sales", status: "active" },
      session: {},
    });
    listQuoteLineItemsMock.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        quote_id: "quote-1",
        pricing_template_id: null,
        product_id: null,
        section_label: null,
        service: "Strategy",
        description: "Planning",
        qty: 1,
        unit_price: 120000,
        total: 120000,
        taxable: false,
        sort_order: 0,
        created_at: "2026-07-09T00:00:00.000Z",
        updated_at: "2026-07-09T00:00:00.000Z",
      },
    ]);
    listQuoteVersionsMock.mockResolvedValue([]);
    createQuoteVersionMock.mockResolvedValue({
      id: "version-1",
      quote_id: "quote-1",
      reason: "issued",
      pdf_url: "/quotes/quote-1/pdf",
    });
    updateQuoteMock.mockResolvedValue({
      id: "quote-1",
      status: "draft",
    });
    updateQuoteLifecycleMock.mockResolvedValue({
      id: "quote-1",
      status: "sent",
      issued_version_id: "version-1",
      pdf_url: "/quotes/quote-1/pdf",
    });
    createJobSheetFromAcceptedQuoteMock.mockResolvedValue({ id: "job-1" });
    decideApprovalMock.mockResolvedValue({
      id: "approval-1",
      approval_type: "quote_send",
      status: "approved",
      context_data: { quote_id: "quote-1" },
    });
    getApprovalMock.mockResolvedValue({
      id: "approval-1",
      approval_type: "quote_send",
      status: "pending",
      context_data: { quote_id: "quote-1" },
    });
    getQuoteMock.mockResolvedValue({
      id: "quote-1",
      number: "Q-1",
      status: "approved",
      account_id: "account-1",
      client_id: "client-1",
      contact_id: null,
      created_by: "sales-1",
      total_value: 120000,
      currency: "HKD",
      pdf_url: "/quotes/quote-1/pdf-existing",
      line_items: [
        {
          id: "li-local-1",
          service: "Strategy",
          description: "Planning",
          qty: 1,
          unit_price: 120000,
        },
      ],
    });
  });

  it("lists quote templates behind Neon auth", async () => {
    listQuoteTemplatesMock.mockResolvedValue([]);
    const { getQuoteTemplates } = await import("../quotes");

    await getQuoteTemplates();

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(listQuoteTemplatesMock).toHaveBeenCalled();
    expect(requireNeonAuthSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      listQuoteTemplatesMock.mock.invocationCallOrder[0],
    );
  });

  it("passes quote document fields through createQuote with the session user", async () => {
    createQuoteMock.mockResolvedValue({ id: "quote-1" });
    const { createQuote } = await import("../quotes");

    await createQuote({
      data: {
        number: "Q-1001",
        lead_id: "lead-1",
        client_id: "client-1",
        contact_id: "contact-1",
        account_id: "account-1",
        deal_id: "deal-1",
        total_value: 120000,
        currency: "USD",
        valid_until: "2026-08-01",
        line_items: [
          {
            id: "line-1",
            service: "Strategy",
            description: "Planning",
            qty: 1,
            unit_price: 120000,
          },
        ],
        quote_template_id: "template-1",
        cover_text: "Intro copy",
        assumptions: "Assume approvals within 48 hours.",
        payment_terms: "50% upfront.",
        document_sections: [{ title: "Scope", body: "Planning" }],
      },
    });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(createQuoteMock).toHaveBeenCalledWith({
      number: "Q-1001",
      lead_id: "lead-1",
      client_id: "client-1",
      contact_id: "contact-1",
      account_id: "account-1",
      deal_id: "deal-1",
      total_value: 120000,
      currency: "USD",
      valid_until: "2026-08-01",
      line_items: [
        { id: "line-1", service: "Strategy", description: "Planning", qty: 1, unit_price: 120000 },
      ],
      quote_template_id: "template-1",
      cover_text: "Intro copy",
      assumptions: "Assume approvals within 48 hours.",
      payment_terms: "50% upfront.",
      document_sections: [{ title: "Scope", body: "Planning" }],
      created_by: "user-1",
    });
    expect(requireNeonAuthSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      createQuoteMock.mock.invocationCallOrder[0],
    );
  });

  it("routes commercial edits through the locked command", async () => {
    const { updateQuote } = await import("../quotes");
    const result = await updateQuote({ data: { id: "quote-1", updates: { total_value: 120000 } } });
    expect(updateQuoteCommercialMock).toHaveBeenCalledWith(
      expect.objectContaining({ actor: expect.objectContaining({ profileId: "user-1" }) }),
      { id: "quote-1", patch: { total_value: 120000 } },
    );
    expect(updateQuoteMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "quote-1", total_value: 120000 });
  });

  it("routes a validated quote revision through the command", async () => {
    const { createQuoteRevision } = await import("../quotes");
    const result = await createQuoteRevision({
      data: {
        id: "quote-1",
        baseVersionId: "version-1",
        reason: "revised",
        idempotencyKey: "revision-key",
      },
    });
    expect(createQuoteRevisionCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ actor: expect.objectContaining({ profileId: "user-1" }) }),
      expect.objectContaining({ id: "quote-1", baseVersionId: "version-1", reason: "revised" }),
    );
    expect(result.quote).toMatchObject({ id: "revision-1", status: "revised" });
  });

  it.each([
    ["status", "sent"],
    ["issued_version_id", "version-issued-1"],
    ["accepted_version_id", "version-accepted-1"],
    ["accepted_at", "2026-07-09T10:00:00.000Z"],
    ["accepted_by", "user-1"],
    ["pdf_url", "/quotes/quote-1/pdf"],
    ["approved_by", "user-1"],
  ])(
    "rejects generic quote updates to lifecycle field %s before repository dispatch",
    async (field, value) => {
      const { updateQuote } = await import("../quotes");

      await expect(
        updateQuote({
          data: {
            id: "quote-1",
            updates: { [field]: value },
          },
        }),
      ).rejects.toThrow("Quote lifecycle fields must be changed through workflow actions");

      expect(updateQuoteMock).not.toHaveBeenCalled();
      expect(updateQuoteLifecycleMock).not.toHaveBeenCalled();
    },
  );

  it("lists quote pdf templates behind Neon auth", async () => {
    listPdfTemplatesMock.mockResolvedValue([]);
    const { getQuotePdfTemplates } = await import("../quotes");

    await getQuotePdfTemplates();

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(listPdfTemplatesMock).toHaveBeenCalledWith("quote");
    expect(requireNeonAuthSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      listPdfTemplatesMock.mock.invocationCallOrder[0],
    );
  });

  it("lists quote versions behind Neon auth", async () => {
    listQuoteVersionsMock.mockResolvedValue([]);
    const { getQuoteVersions } = await import("../quotes");

    await getQuoteVersions({ data: { quoteId: "quote-1" } });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(listQuoteVersionsMock).toHaveBeenCalledWith("quote-1");
    expect(requireNeonAuthSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      listQuoteVersionsMock.mock.invocationCallOrder[0],
    );
  });

  it("routes approval through the atomic decision command without issuing", async () => {
    const { approveQuote } = await import("../quotes");
    const result = await approveQuote({ data: { id: "quote-1", approvalId: "approval-1" } });
    expect(decideQuoteSendCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ actor: expect.objectContaining({ profileId: "user-1" }) }),
      expect.objectContaining({ id: "quote-1", approvalId: "approval-1", decision: "approved" }),
    );
    expect(issueQuoteCommandMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "approved" });
  });

  it("routes rejection through the same atomic decision command", async () => {
    decideQuoteSendCommandMock.mockResolvedValueOnce({
      quote: { id: "quote-1", status: "rejected" },
      approval: { id: "approval-1", status: "rejected" },
    });
    const { rejectQuote } = await import("../quotes");
    const result = await rejectQuote({ data: { id: "quote-1", approvalId: "approval-1" } });
    expect(decideQuoteSendCommandMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ decision: "rejected" }),
    );
    expect(result).toMatchObject({ status: "rejected" });
  });

  it("routes issuance through the versioned transaction command", async () => {
    const { issueQuoteVersion } = await import("../quotes");
    const result = await issueQuoteVersion({ data: { id: "quote-1" } });
    expect(requireCapabilityMock).toHaveBeenCalledWith(
      "quotes.issue",
      { resourceType: "quote", resourceId: "quote-1" },
      expect.anything(),
    );
    expect(issueQuoteCommandMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "quote-1" }),
    );
    expect(result.version.id).toBe("issued-1");
  });

  it("requires approve, issue and approval-decision gates for the legacy combined endpoint", async () => {
    const { approveAndIssueQuote } = await import("../quotes");
    await approveAndIssueQuote({ data: { id: "quote-1", approvalId: "approval-1" } });
    expect(requireCapabilityMock.mock.calls.map((call) => call[0])).toEqual([
      "quotes.approve",
      "quotes.issue",
      "approvals.decide",
    ]);
    expect(approveAndIssueQuoteCommandMock).toHaveBeenCalledOnce();
  });

  it("does not invoke combined issuance when the issue gate denies", async () => {
    requireCapabilityMock.mockImplementation(async (capability: string) => {
      if (capability === "quotes.issue") throw new Error("FORBIDDEN");
    });
    const { approveAndIssueQuote } = await import("../quotes");
    await expect(
      approveAndIssueQuote({ data: { id: "quote-1", approvalId: "approval-1" } }),
    ).rejects.toThrow("FORBIDDEN");
    expect(approveAndIssueQuoteCommandMock).not.toHaveBeenCalled();
  });

  it("passes explicit customer acceptance evidence to the transaction command", async () => {
    const { acceptQuoteAndCreateJobSheet } = await import("../quotes");
    const input = {
      id: "quote-1",
      issuedVersionId: "version-1",
      acceptanceEvidence: { reference: "email:fixture" },
    };
    const result = await acceptQuoteAndCreateJobSheet({ data: input });
    expect(acceptQuoteCommandMock).toHaveBeenCalledWith(expect.anything(), input);
    expect(result.jobSheet.id).toBe("sheet-1");
  });
});
