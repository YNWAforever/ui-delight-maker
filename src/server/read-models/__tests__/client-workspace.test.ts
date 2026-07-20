import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientMock,
  listClientContactsMock,
  listEngagementsByClientMock,
  listQuotesMock,
  listJobSheetsMock,
  queryMock,
  queryOneMock,
  requireCapabilitySetMock,
  createServerFnChain,
} = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    getClientMock: vi.fn(),
    listClientContactsMock: vi.fn(),
    listEngagementsByClientMock: vi.fn(),
    listQuotesMock: vi.fn(),
    listJobSheetsMock: vi.fn(),
    queryMock: vi.fn(),
    queryOneMock: vi.fn(),
    requireCapabilitySetMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapabilitySet: requireCapabilitySetMock,
}));

vi.mock("@/server/db/neon.server", () => ({
  query: queryMock,
  queryOne: queryOneMock,
}));

vi.mock("@/server/repositories/clients", () => ({ getClient: getClientMock }));
vi.mock("@/server/repositories/client-contacts", () => ({
  listClientContacts: listClientContactsMock,
}));
vi.mock("@/server/repositories/engagements", () => ({
  listEngagementsByClient: listEngagementsByClientMock,
}));
vi.mock("@/server/repositories/quotes", () => ({ listQuotes: listQuotesMock }));
vi.mock("@/server/repositories/job-sheets", () => ({ listJobSheets: listJobSheetsMock }));

const client = {
  id: "client-1",
  account_id: "account-1",
  primary_contact_id: "contact-1",
  company_name: "Acme",
  industry: "Technology",
  tier: "enterprise",
  account_owner: "owner-1",
  health_score: 82,
  onboarding_status: "active",
  renewal_date: "2026-12-31",
  arr: 120_000,
  renewal_risk: "medium",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
} as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("client workspace read model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientMock.mockResolvedValue(client);
    queryOneMock.mockResolvedValue({
      contact_count: "3",
      engagement_count: "4",
      quote_count: "5",
      job_sheet_count: "2",
    });
    listClientContactsMock.mockResolvedValue([]);
    listEngagementsByClientMock.mockResolvedValue([]);
    listQuotesMock.mockResolvedValue([]);
    listJobSheetsMock.mockResolvedValue([]);
    queryMock.mockResolvedValue([]);
    requireCapabilitySetMock.mockResolvedValue({
      "accounts.view": true,
      "contacts.view": true,
      "engagements.view": true,
      "quotes.view": true,
      "job_sheets.view": true,
    });
  });

  it("loads only identity, ownership, relationship summary, and counts initially", async () => {
    const { loadClientWorkspaceRead } = await import("../client-workspace");

    await expect(loadClientWorkspaceRead("client-1", "request-1")).resolves.toEqual({
      requestId: "request-1",
      identity: {
        id: "client-1",
        accountId: "account-1",
        primaryContactId: "contact-1",
        companyName: "Acme",
        industry: "Technology",
        tier: "enterprise",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      ownership: { accountOwnerId: "owner-1" },
      relationship: {
        healthScore: 82,
        onboardingStatus: "active",
        renewalDate: "2026-12-31",
        renewalRisk: "medium",
        arr: 120_000,
      },
      counts: { contacts: 3, engagements: 4, quotes: 5, jobSheets: 2 },
    });

    expect(getClientMock).toHaveBeenCalledWith("client-1");
    expect(queryOneMock).toHaveBeenCalledTimes(1);
    expect(queryOneMock).toHaveBeenCalledWith(expect.stringContaining("$2::boolean"), [
      "client-1",
      true,
      true,
      true,
      true,
    ]);
    expect(listClientContactsMock).not.toHaveBeenCalled();
    expect(listEngagementsByClientMock).not.toHaveBeenCalled();
    expect(listQuotesMock).not.toHaveBeenCalled();
    expect(listJobSheetsMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it.each([1, 25])(
    "loads client and %i engagement activity with one bounded SQL query",
    async (engagementCount) => {
      listEngagementsByClientMock.mockResolvedValue(
        Array.from({ length: engagementCount }, (_, index) => ({ id: `e-${index}` })),
      );
      const { loadClientWorkspaceSection } = await import("../client-workspace");

      await expect(
        loadClientWorkspaceSection("client-1", "activity", "request-1"),
      ).resolves.toEqual({ status: "empty", data: { activityLogs: [] } });

      expect(listEngagementsByClientMock).toHaveBeenCalledTimes(1);
      expect(queryMock).toHaveBeenCalledTimes(1);
      const [sql, values] = queryMock.mock.calls[0] as [string, unknown[]];
      expect(sql.replace(/\s+/g, " ")).toMatch(
        /object_type = 'client'.*object_id = \$1.*object_type = 'engagement'.*object_id = any\(\$2::uuid\[\]\).*limit \$3/i,
      );
      expect(values).toEqual([
        "client-1",
        Array.from({ length: engagementCount }, (_, index) => `e-${index}`),
        100,
      ]);
    },
  );

  it("loads commercial quotes with a client-scoped repository filter", async () => {
    listQuotesMock.mockResolvedValue([{ id: "quote-1" }]);
    const { loadClientWorkspaceSection } = await import("../client-workspace");

    await expect(
      loadClientWorkspaceSection("client-1", "commercial", "request-1"),
    ).resolves.toEqual({ status: "ready", data: { quotes: [{ id: "quote-1" }] } });
    expect(listQuotesMock).toHaveBeenCalledWith({ client_id: "client-1" });
  });

  it("authorizes both server reads before starting repository work", async () => {
    const authorization = deferred<Record<string, boolean>>();
    requireCapabilitySetMock.mockReturnValueOnce(authorization.promise);
    const { getClientWorkspaceRead, getClientWorkspaceSection } =
      await import("@/server-functions/client-workspace");

    const readPromise = getClientWorkspaceRead({ data: { clientId: "client-1" } });

    expect(requireCapabilitySetMock).toHaveBeenCalledWith(["accounts.view"], {
      optional: ["contacts.view", "engagements.view", "quotes.view", "job_sheets.view"],
      target: { resourceType: "client", resourceId: "client-1" },
    });
    expect(getClientMock).not.toHaveBeenCalled();
    expect(queryOneMock).not.toHaveBeenCalled();

    authorization.resolve({
      "accounts.view": true,
      "contacts.view": true,
      "engagements.view": true,
      "quotes.view": true,
      "job_sheets.view": true,
    });
    await readPromise;

    await getClientWorkspaceSection({
      data: { clientId: "client-1", section: "contacts" },
    });
    expect(requireCapabilitySetMock).toHaveBeenLastCalledWith(["accounts.view", "contacts.view"], {
      target: { resourceType: "client", resourceId: "client-1" },
    });
    expect(listClientContactsMock).toHaveBeenCalledWith("client-1");

    await getClientWorkspaceSection({
      data: { clientId: "client-1", section: "engagements" },
    });
    expect(requireCapabilitySetMock).toHaveBeenLastCalledWith(
      ["accounts.view", "engagements.view"],
      { target: { resourceType: "client", resourceId: "client-1" } },
    );

    await getClientWorkspaceSection({
      data: { clientId: "client-1", section: "job_sheets" },
    });
    expect(requireCapabilitySetMock).toHaveBeenLastCalledWith(
      ["accounts.view", "job_sheets.view"],
      { target: { resourceType: "client", resourceId: "client-1" } },
    );
  });
});
