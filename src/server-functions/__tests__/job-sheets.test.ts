import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireCapabilityMock,
  loadRequestAuthorizationMock,
  requireNeonAuthSessionMock,
  getJobSheetRepositoryMock,
  listJobSheetsMock,
  replaceJobSheetPortionsMock,
  acceptJobSheetMock,
  updateXeroNotesCommandMock,
  confirmXeroEntryCommandMock,
  correctXeroEntryCommandMock,
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
    getJobSheetRepositoryMock: vi.fn(),
    listJobSheetsMock: vi.fn(),
    replaceJobSheetPortionsMock: vi.fn(),
    acceptJobSheetMock: vi.fn(),
    updateXeroNotesCommandMock: vi.fn(),
    confirmXeroEntryCommandMock: vi.fn(),
    correctXeroEntryCommandMock: vi.fn(),
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

vi.mock("@/server/commands/billing-portion.server", () => ({
  updateXeroNotesCommand: updateXeroNotesCommandMock,
  confirmXeroEntryCommand: confirmXeroEntryCommandMock,
  correctXeroEntryCommand: correctXeroEntryCommandMock,
}));

vi.mock("@/server/repositories/job-sheets", () => ({
  getJobSheet: getJobSheetRepositoryMock,
  listJobSheets: listJobSheetsMock,
  replaceJobSheetPortions: replaceJobSheetPortionsMock,
  acceptJobSheet: acceptJobSheetMock,
}));

describe("job sheet server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadRequestAuthorizationMock
      .mockReset()
      .mockResolvedValue({ actor: { profileId: "acct-1" }, overrides: [] });
    requireCapabilityMock.mockResolvedValue({
      user: { id: "user-1" },
      profile: { id: "user-1", role: "sales", status: "active" },
      session: {},
    });

    requireNeonAuthSessionMock.mockResolvedValue({
      user: { id: "acct-1" },
      profile: { id: "acct-1", role: "sales", status: "active" },
      session: {},
    });
    getJobSheetRepositoryMock.mockResolvedValue({ jobSheet: { id: "job-1" }, portions: [] });
    listJobSheetsMock.mockResolvedValue([]);
    replaceJobSheetPortionsMock.mockResolvedValue([]);
    acceptJobSheetMock.mockResolvedValue({ id: "job-1", status: "accepted" });
    updateXeroNotesCommandMock.mockResolvedValue({ id: "portion-1", status: "planned" });
    confirmXeroEntryCommandMock.mockResolvedValue({ id: "portion-1", status: "entered_in_xero" });
    correctXeroEntryCommandMock.mockResolvedValue({ id: "portion-1", status: "planned" });
  });

  it("loads authorization before listing job sheets", async () => {
    const { getJobSheets } = await import("../job-sheets");

    await getJobSheets({ data: { status: "accounting_review" } });

    expect(loadRequestAuthorizationMock).toHaveBeenCalled();
    expect(listJobSheetsMock).toHaveBeenCalledWith(
      { status: "accounting_review" },
      expect.anything(),
    );
  });

  it("stops before repository access when Neon auth fails", async () => {
    loadRequestAuthorizationMock.mockRejectedValueOnce(new Error("Unauthorized"));
    const { getJobSheets } = await import("../job-sheets");

    await expect(getJobSheets({ data: { status: "accounting_review" } })).rejects.toThrow(
      "Unauthorized",
    );
    expect(listJobSheetsMock).not.toHaveBeenCalled();
  });

  it("requires Neon auth before getting a job sheet", async () => {
    const { getJobSheet } = await import("../job-sheets");

    await getJobSheet({ data: { id: "job-1" } });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(getJobSheetRepositoryMock).toHaveBeenCalledWith("job-1");
  });

  it("requires Neon auth before replacing job sheet portions", async () => {
    const { updateJobSheetPortions } = await import("../job-sheets");

    await updateJobSheetPortions({
      data: {
        id: "job-1",
        portions: [
          {
            name: "Strategy",
            source_quote_line_item_ids: ["11111111-1111-4111-8111-111111111111"],
            description: "Planning",
            amount: 120000,
            currency: "HKD",
            target_invoice_date: "2026-07-31",
            billing_type: "progress",
            status: "planned",
            sort_order: 0,
          },
        ],
      },
    });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(replaceJobSheetPortionsMock).toHaveBeenCalledWith("job-1", [
      {
        name: "Strategy",
        source_quote_line_item_ids: ["11111111-1111-4111-8111-111111111111"],
        description: "Planning",
        amount: 120000,
        currency: "HKD",
        target_invoice_date: "2026-07-31",
        billing_type: "progress",
        status: "planned",
        sort_order: 0,
      },
    ]);
  });

  it("passes the accounting user into job sheet acceptance", async () => {
    const { acceptJobSheetForAccounting } = await import("../job-sheets");

    await acceptJobSheetForAccounting({ data: { id: "job-1" } });

    expect(requireCapabilityMock).toHaveBeenCalledWith("job_sheets.accept", {
      resourceType: "job_sheet",
      resourceId: "job-1",
    });
    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(acceptJobSheetMock).toHaveBeenCalledWith("job-1", { accepted_by: "acct-1" });
  });

  it("authorizes a scoped note save without confirming an invoice", async () => {
    const { updateXeroNotes } = await import("../job-sheets");
    const data = {
      portionId: "portion-1",
      notes: "Awaiting PO",
      expectedVersion: 0,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    };
    await updateXeroNotes({ data });

    expect(loadRequestAuthorizationMock).toHaveBeenCalled();
    expect(requireCapabilityMock).toHaveBeenCalledWith(
      "job_sheets.update_billing",
      { resourceType: "job_sheet_portion", resourceId: "portion-1" },
      expect.anything(),
    );
    expect(updateXeroNotesCommandMock).toHaveBeenCalledWith(expect.anything(), data);
    expect(confirmXeroEntryCommandMock).not.toHaveBeenCalled();
  });

  it("blocks manual confirmation before the command if authorization fails", async () => {
    requireCapabilityMock.mockRejectedValueOnce(new Error("Forbidden"));
    const { confirmXeroEntry } = await import("../job-sheets");
    await expect(
      confirmXeroEntry({
        data: {
          portionId: "portion-1",
          invoiceNumber: "INV-001",
          invoiceDate: "2026-09-27",
          expectedVersion: 0,
          idempotencyKey: "22222222-2222-4222-8222-222222222222",
        },
      }),
    ).rejects.toThrow("Forbidden");
    expect(confirmXeroEntryCommandMock).not.toHaveBeenCalled();
  });

  it("passes the correction reason and version into the guarded command", async () => {
    const { correctXeroEntry } = await import("../job-sheets");
    const data = {
      portionId: "portion-1",
      expectedVersion: 1,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      reason: "Voided in Xero",
      patch: { status: "planned" as const },
    };
    await correctXeroEntry({ data });
    expect(correctXeroEntryCommandMock).toHaveBeenCalledWith(expect.anything(), data);
  });
});
