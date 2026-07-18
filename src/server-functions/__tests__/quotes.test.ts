import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireCapabilityMock,
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
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: requireCapabilityMock,
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
  decideApproval: decideApprovalMock,
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
    requireCapabilityMock.mockResolvedValue({ user: { id: "user-1" } });

    requireNeonAuthSessionMock.mockResolvedValue({ user: { id: "user-1" } });
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

  it("approves a pending quote through the lifecycle helper", async () => {
    getQuoteMock.mockResolvedValueOnce({
      id: "quote-1",
      status: "pending_approval",
    });
    updateQuoteLifecycleMock.mockResolvedValueOnce({
      id: "quote-1",
      status: "approved",
      approved_by: "user-1",
    });
    const { approveQuote } = await import("../quotes");

    const result = await approveQuote({ data: { id: "quote-1" } });

    expect(requireCapabilityMock).toHaveBeenCalledWith("quotes.approve", {
      resourceType: "quote",
      resourceId: "quote-1",
    });
    expect(getQuoteMock).toHaveBeenCalledWith("quote-1");
    expect(updateQuoteLifecycleMock).toHaveBeenCalledWith("quote-1", {
      status: "approved",
      approved_by: "user-1",
    });
    expect(updateQuoteMock).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "quote-1", status: "approved", approved_by: "user-1" });
  });

  it("rejects a pending quote and records the approval decision when provided", async () => {
    getQuoteMock.mockResolvedValueOnce({
      id: "quote-1",
      status: "pending_approval",
    });
    updateQuoteLifecycleMock.mockResolvedValueOnce({
      id: "quote-1",
      status: "rejected",
    });
    const { rejectQuote } = await import("../quotes");

    const result = await rejectQuote({
      data: { id: "quote-1", approvalId: "approval-1", notes: "Scope needs revision" },
    });

    expect(decideApprovalMock).toHaveBeenCalledWith({
      id: "approval-1",
      decision: "rejected",
      notes: "Scope needs revision",
      actorId: "user-1",
    });
    expect(updateQuoteLifecycleMock).toHaveBeenCalledWith("quote-1", { status: "rejected" });
    expect(updateQuoteMock).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "quote-1", status: "rejected" });
  });

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

  it("issues a quote by creating an issued version snapshot and updating the quote", async () => {
    createQuoteVersionMock.mockResolvedValue({
      id: "version-issued-1",
      pdf_url: "/quotes/quote-1/pdf",
    });
    updateQuoteLifecycleMock.mockResolvedValue({
      id: "quote-1",
      status: "sent",
      issued_version_id: "version-issued-1",
      pdf_url: "/quotes/quote-1/pdf",
    });
    const { issueQuoteVersion } = await import("../quotes");

    const result = await issueQuoteVersion({
      data: { id: "quote-1", pdfTemplateId: "pdf-template-1" },
    });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(getQuoteMock).toHaveBeenCalledWith("quote-1");
    expect(requireNeonAuthSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      getQuoteMock.mock.invocationCallOrder[0],
    );
    expect(createQuoteVersionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quote_id: "quote-1",
        reason: "issued",
        snapshot: expect.objectContaining({
          id: "quote-1",
          number: "Q-1",
          line_items: [
            expect.objectContaining({
              id: "11111111-1111-4111-8111-111111111111",
            }),
          ],
        }),
        pdf_template_id: "pdf-template-1",
        pdf_url: "/quotes/quote-1/pdf",
        created_by: "user-1",
      }),
    );
    expect(listQuoteLineItemsMock).toHaveBeenCalledWith("quote-1");
    expect(updateQuoteLifecycleMock).toHaveBeenCalledWith(
      "quote-1",
      expect.objectContaining({
        status: "sent",
        issued_version_id: "version-issued-1",
        pdf_url: "/quotes/quote-1/pdf",
      }),
    );
    expect(result).toEqual({
      quote: {
        id: "quote-1",
        status: "sent",
        issued_version_id: "version-issued-1",
        pdf_url: "/quotes/quote-1/pdf",
      },
      version: {
        id: "version-issued-1",
        pdf_url: "/quotes/quote-1/pdf",
      },
    });
  });

  it("approves a quote-send approval and issues the quote through lifecycle updates", async () => {
    getQuoteMock.mockResolvedValueOnce({
      id: "quote-1",
      number: "Q-1",
      status: "pending_approval",
      account_id: "account-1",
      client_id: "client-1",
      contact_id: null,
      created_by: "sales-1",
      total_value: 120000,
      currency: "HKD",
      pdf_url: null,
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
    updateQuoteLifecycleMock
      .mockResolvedValueOnce({
        id: "quote-1",
        number: "Q-1",
        status: "approved",
        account_id: "account-1",
        client_id: "client-1",
        contact_id: null,
        created_by: "sales-1",
        total_value: 120000,
        currency: "HKD",
        pdf_url: null,
        approved_by: "user-1",
        line_items: [],
      })
      .mockResolvedValueOnce({
        id: "quote-1",
        status: "sent",
        issued_version_id: "version-issued-1",
        pdf_url: "/quotes/quote-1/pdf",
      });
    createQuoteVersionMock.mockResolvedValue({
      id: "version-issued-1",
      pdf_url: "/quotes/quote-1/pdf",
    });
    const { approveAndIssueQuote } = await import("../quotes");

    const result = await approveAndIssueQuote({
      data: { id: "quote-1", approvalId: "approval-1", pdfTemplateId: "pdf-template-1" },
    });

    expect(decideApprovalMock).toHaveBeenCalledWith({
      id: "approval-1",
      decision: "approved",
      actorId: "user-1",
    });
    expect(getApprovalMock).toHaveBeenCalledWith("approval-1");
    expect(updateQuoteLifecycleMock).toHaveBeenNthCalledWith(1, "quote-1", {
      status: "approved",
      approved_by: "user-1",
    });
    expect(createQuoteVersionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quote_id: "quote-1",
        reason: "issued",
        pdf_template_id: "pdf-template-1",
        pdf_url: "/quotes/quote-1/pdf",
        created_by: "user-1",
      }),
    );
    expect(updateQuoteLifecycleMock).toHaveBeenNthCalledWith(
      2,
      "quote-1",
      expect.objectContaining({
        status: "sent",
        issued_version_id: "version-issued-1",
        pdf_url: "/quotes/quote-1/pdf",
      }),
    );
    expect(updateQuoteMock).not.toHaveBeenCalled();
    expect(result.quote).toEqual(
      expect.objectContaining({
        id: "quote-1",
        status: "sent",
        issued_version_id: "version-issued-1",
      }),
    );
  });

  it("validates quote-send approval ownership before deciding or issuing", async () => {
    getApprovalMock.mockResolvedValueOnce({
      id: "approval-1",
      approval_type: "quote_send",
      status: "pending",
      context_data: { quote_id: "other-quote" },
    });
    decideApprovalMock.mockResolvedValueOnce({
      id: "approval-1",
      approval_type: "quote_send",
      status: "approved",
      context_data: { quote_id: "other-quote" },
    });
    const { approveAndIssueQuote } = await import("../quotes");

    await expect(
      approveAndIssueQuote({ data: { id: "quote-1", approvalId: "approval-1" } }),
    ).rejects.toThrow("Approval does not match quote");

    expect(getApprovalMock).toHaveBeenCalledWith("approval-1");
    expect(decideApprovalMock).not.toHaveBeenCalled();
    expect(updateQuoteLifecycleMock).not.toHaveBeenCalled();
    expect(createQuoteVersionMock).not.toHaveBeenCalled();
  });

  it("requires quote-send approvals to reference the quote before issuing", async () => {
    getApprovalMock.mockResolvedValueOnce({
      id: "approval-1",
      approval_type: "quote_send",
      status: "pending",
      context_data: {},
    });
    const { approveAndIssueQuote } = await import("../quotes");

    await expect(
      approveAndIssueQuote({ data: { id: "quote-1", approvalId: "approval-1" } }),
    ).rejects.toThrow("Approval does not reference quote");

    expect(decideApprovalMock).not.toHaveBeenCalled();
    expect(updateQuoteLifecycleMock).not.toHaveBeenCalled();
    expect(createQuoteVersionMock).not.toHaveBeenCalled();
  });

  it("rejects approving a quote from an already-decided quote-send approval", async () => {
    getApprovalMock.mockResolvedValueOnce({
      id: "approval-1",
      approval_type: "quote_send",
      status: "rejected",
      context_data: { quote_id: "quote-1" },
    });
    const { approveAndIssueQuote } = await import("../quotes");

    await expect(
      approveAndIssueQuote({ data: { id: "quote-1", approvalId: "approval-1" } }),
    ).rejects.toThrow("Only pending quote-send approvals can change quote lifecycle");

    expect(decideApprovalMock).not.toHaveBeenCalled();
    expect(updateQuoteLifecycleMock).not.toHaveBeenCalled();
    expect(createQuoteVersionMock).not.toHaveBeenCalled();
  });

  it("rejects rejecting a quote from an already-decided quote-send approval", async () => {
    getApprovalMock.mockResolvedValueOnce({
      id: "approval-1",
      approval_type: "quote_send",
      status: "approved",
      context_data: { quote_id: "quote-1" },
    });
    const { rejectQuote } = await import("../quotes");

    await expect(
      rejectQuote({ data: { id: "quote-1", approvalId: "approval-1" } }),
    ).rejects.toThrow("Only pending quote-send approvals can change quote lifecycle");

    expect(getQuoteMock).not.toHaveBeenCalled();
    expect(decideApprovalMock).not.toHaveBeenCalled();
    expect(updateQuoteLifecycleMock).not.toHaveBeenCalled();
  });

  it("reuses an orphaned issued version on retry instead of creating a duplicate", async () => {
    const existingVersion = {
      id: "version-issued-1",
      quote_id: "quote-1",
      reason: "issued",
      pdf_url: "/quotes/quote-1/pdf",
    };
    getQuoteMock.mockResolvedValue({
      id: "quote-1",
      number: "Q-1",
      status: "sent",
      account_id: "account-1",
      client_id: "client-1",
      contact_id: null,
      created_by: "sales-1",
      total_value: 120000,
      currency: "HKD",
      pdf_url: "/quotes/quote-1/pdf",
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
    listQuoteVersionsMock.mockResolvedValue([existingVersion]);
    updateQuoteLifecycleMock.mockResolvedValue({
      id: "quote-1",
      status: "sent",
      issued_version_id: "version-issued-1",
      pdf_url: "/quotes/quote-1/pdf",
    });
    const { issueQuoteVersion } = await import("../quotes");

    const result = await issueQuoteVersion({
      data: { id: "quote-1", pdfTemplateId: "pdf-template-1" },
    });

    expect(requireNeonAuthSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      getQuoteMock.mock.invocationCallOrder[0],
    );
    expect(listQuoteVersionsMock).toHaveBeenCalledWith("quote-1");
    expect(createQuoteVersionMock).not.toHaveBeenCalled();
    expect(updateQuoteLifecycleMock).toHaveBeenCalledWith(
      "quote-1",
      expect.objectContaining({
        status: "sent",
        issued_version_id: "version-issued-1",
        pdf_url: "/quotes/quote-1/pdf",
      }),
    );
    expect(result).toEqual({
      quote: expect.objectContaining({
        id: "quote-1",
        issued_version_id: "version-issued-1",
        status: "sent",
      }),
      version: existingVersion,
    });
  });

  it("accepts a quote by creating an accepted version and draft job sheet", async () => {
    getQuoteMock.mockResolvedValueOnce({
      id: "quote-1",
      number: "Q-1",
      status: "sent",
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
    createQuoteVersionMock.mockResolvedValue({ id: "version-1" });
    updateQuoteLifecycleMock.mockResolvedValue({
      id: "quote-1",
      status: "accepted",
      accepted_version_id: "version-1",
      accepted_at: "2026-07-09T10:00:00.000Z",
    });
    createJobSheetFromAcceptedQuoteMock.mockResolvedValue({ id: "job-1" });
    const { acceptQuoteAndCreateJobSheet } = await import("../quotes");

    const result = await acceptQuoteAndCreateJobSheet({ data: { id: "quote-1" } });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(getQuoteMock).toHaveBeenCalledWith("quote-1");
    expect(createQuoteVersionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quote_id: "quote-1",
        reason: "accepted",
        snapshot: expect.objectContaining({
          id: "quote-1",
          number: "Q-1",
          pdf_url: "/quotes/quote-1/pdf-existing",
          line_items: [
            expect.objectContaining({
              id: "11111111-1111-4111-8111-111111111111",
            }),
          ],
        }),
        created_by: "user-1",
      }),
    );
    expect(listQuoteLineItemsMock).toHaveBeenCalledWith("quote-1");
    expect(updateQuoteLifecycleMock).toHaveBeenCalledWith(
      "quote-1",
      expect.objectContaining({
        status: "accepted",
        accepted_version_id: "version-1",
        accepted_at: expect.any(String),
        accepted_by: "user-1",
      }),
    );
    expect(createJobSheetFromAcceptedQuoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quote_id: "quote-1",
        accepted_quote_version_id: "version-1",
        total_amount: 120000,
      }),
    );
    expect(result).toEqual({
      quote: {
        id: "quote-1",
        status: "accepted",
        accepted_version_id: "version-1",
        accepted_at: "2026-07-09T10:00:00.000Z",
      },
      jobSheet: { id: "job-1" },
    });
  });

  it("reuses an orphaned accepted version on retry and keeps job-sheet creation idempotent", async () => {
    const existingAcceptedVersion = {
      id: "version-accepted-1",
      quote_id: "quote-1",
      reason: "accepted",
      pdf_url: "/quotes/quote-1/pdf-existing",
    };
    getQuoteMock.mockResolvedValue({
      id: "quote-1",
      number: "Q-1",
      status: "accepted",
      accepted_at: "2026-07-09T08:30:00.000Z",
      accepted_by: "user-1",
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
    listQuoteVersionsMock.mockResolvedValue([existingAcceptedVersion]);
    updateQuoteLifecycleMock.mockResolvedValue({
      id: "quote-1",
      status: "accepted",
      accepted_version_id: "version-accepted-1",
      accepted_at: "2026-07-09T08:30:00.000Z",
    });
    createJobSheetFromAcceptedQuoteMock.mockResolvedValue({ id: "job-1" });
    const { acceptQuoteAndCreateJobSheet } = await import("../quotes");

    const result = await acceptQuoteAndCreateJobSheet({ data: { id: "quote-1" } });

    expect(requireNeonAuthSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      getQuoteMock.mock.invocationCallOrder[0],
    );
    expect(listQuoteVersionsMock).toHaveBeenCalledWith("quote-1");
    expect(createQuoteVersionMock).not.toHaveBeenCalled();
    expect(updateQuoteLifecycleMock).toHaveBeenCalledWith(
      "quote-1",
      expect.objectContaining({
        status: "accepted",
        accepted_version_id: "version-accepted-1",
        accepted_at: "2026-07-09T08:30:00.000Z",
        accepted_by: "user-1",
      }),
    );
    expect(createJobSheetFromAcceptedQuoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quote_id: "quote-1",
        accepted_quote_version_id: "version-accepted-1",
      }),
    );
    expect(result).toEqual({
      quote: expect.objectContaining({
        id: "quote-1",
        accepted_version_id: "version-accepted-1",
        accepted_at: "2026-07-09T08:30:00.000Z",
        status: "accepted",
      }),
      jobSheet: { id: "job-1" },
    });
  });

  it("rejects issuing a draft quote", async () => {
    getQuoteMock.mockResolvedValueOnce({
      id: "quote-1",
      number: "Q-1",
      status: "draft",
      account_id: "account-1",
      client_id: "client-1",
      contact_id: null,
      created_by: "sales-1",
      total_value: 120000,
      currency: "HKD",
      pdf_url: "/quotes/quote-1/pdf-existing",
      line_items: [],
    });
    const { issueQuoteVersion } = await import("../quotes");

    await expect(issueQuoteVersion({ data: { id: "quote-1" } })).rejects.toThrow("approved");
    expect(createQuoteVersionMock).not.toHaveBeenCalled();
    expect(updateQuoteMock).not.toHaveBeenCalled();
  });

  it.each(["draft", "pending_approval"])(
    "rejects accepting a %s quote before it has been issued",
    async (status) => {
      getQuoteMock.mockResolvedValueOnce({
        id: "quote-1",
        number: "Q-1",
        status,
        account_id: "account-1",
        client_id: "client-1",
        contact_id: null,
        created_by: "sales-1",
        total_value: 120000,
        currency: "HKD",
        pdf_url: "/quotes/quote-1/pdf-existing",
        line_items: [],
      });
      const { acceptQuoteAndCreateJobSheet } = await import("../quotes");

      await expect(acceptQuoteAndCreateJobSheet({ data: { id: "quote-1" } })).rejects.toThrow(
        "sent or viewed",
      );
      expect(createQuoteVersionMock).not.toHaveBeenCalled();
      expect(updateQuoteMock).not.toHaveBeenCalled();
      expect(createJobSheetFromAcceptedQuoteMock).not.toHaveBeenCalled();
    },
  );
});
