import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireCapabilityMock,
  requireNeonAuthSessionMock,
  getJobSheetRepositoryMock,
  listJobSheetsMock,
  replaceJobSheetPortionsMock,
  acceptJobSheetMock,
  updateJobSheetXeroReferenceMock,
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
    getJobSheetRepositoryMock: vi.fn(),
    listJobSheetsMock: vi.fn(),
    replaceJobSheetPortionsMock: vi.fn(),
    acceptJobSheetMock: vi.fn(),
    updateJobSheetXeroReferenceMock: vi.fn(),
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

vi.mock("@/server/repositories/job-sheets", () => ({
  getJobSheet: getJobSheetRepositoryMock,
  listJobSheets: listJobSheetsMock,
  replaceJobSheetPortions: replaceJobSheetPortionsMock,
  acceptJobSheet: acceptJobSheetMock,
  updateJobSheetXeroReference: updateJobSheetXeroReferenceMock,
}));

describe("job sheet server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    updateJobSheetXeroReferenceMock.mockResolvedValue({
      id: "portion-1",
      status: "entered_in_xero",
    });
  });

  it("requires Neon auth before listing job sheets", async () => {
    const { getJobSheets } = await import("../job-sheets");

    await getJobSheets({ data: { status: "accounting_review" } });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(listJobSheetsMock).toHaveBeenCalledWith({ status: "accounting_review" });
  });

  it("stops before repository access when Neon auth fails", async () => {
    requireNeonAuthSessionMock.mockRejectedValueOnce(new Error("Unauthorized"));
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

  it("requires Neon auth before updating Xero references", async () => {
    const { updatePortionXeroReference } = await import("../job-sheets");

    await updatePortionXeroReference({
      data: {
        portion_id: "portion-1",
        xero_invoice_number: "INV-001",
        xero_invoice_reference: "XERO-REF-001",
        xero_invoice_date: "2026-07-09",
        xero_notes: "Manually entered in Xero",
      },
    });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(updateJobSheetXeroReferenceMock).toHaveBeenCalledWith({
      portion_id: "portion-1",
      xero_invoice_number: "INV-001",
      xero_invoice_reference: "XERO-REF-001",
      xero_invoice_date: "2026-07-09",
      xero_notes: "Manually entered in Xero",
    });
  });
});
