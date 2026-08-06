import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  transactionMock,
  queryMock,
  createAccountMock,
  createAccountContactMock,
  createCampaignMemberMock,
} = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  queryMock: vi.fn(),
  createAccountMock: vi.fn(),
  createAccountContactMock: vi.fn(),
  createCampaignMemberMock: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  transaction: transactionMock,
  query: queryMock,
}));

vi.mock("@/server/repositories/accounts", () => ({
  createAccount: createAccountMock,
}));

vi.mock("@/server/repositories/account-contacts", () => ({
  createAccountContact: createAccountContactMock,
}));

vi.mock("@/server/repositories/campaigns", () => ({
  createCampaignMember: createCampaignMemberMock,
}));

describe("event import repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (work: (db: object) => Promise<unknown>) => work({}));
    queryMock.mockResolvedValue([]);
    createCampaignMemberMock.mockResolvedValue({ id: "member-1" });
  });

  /**
   * Both of these reads were unfiltered — every account and every active contact in the tenant,
   * on each validation call and again on commit. What matters now is that the narrowing is
   * driven by the file and that neither read fires at all when there is nothing to look up.
   */
  describe("candidate reads are scoped to the import", () => {
    it("prefilters accounts by the longest token of each imported company name", async () => {
      const { listEventImportAccountCandidates } = await import("../event-import");

      await listEventImportAccountCandidates(["Apex CRM Limited", "The Kowloon Trading Company"]);

      const [sql, values] = queryMock.mock.calls[0]!;
      expect(String(sql).replace(/\s+/g, " ")).toContain(
        "lower(regexp_replace(name, '[^A-Za-z0-9]+', '', 'g')) like any",
      );
      expect(values).toEqual([["apex", "kowloon"]]);
    });

    it("deduplicates tokens so a file of one company does not repeat its filter", async () => {
      const { listEventImportAccountCandidates } = await import("../event-import");

      await listEventImportAccountCandidates(["Apex CRM", "APEX (CRM) Co.", "apex crm ltd"]);

      expect(queryMock.mock.calls[0]![1]).toEqual([["apex"]]);
    });

    it("reads nothing when no imported name yields a usable token", async () => {
      const { listEventImportAccountCandidates } = await import("../event-import");

      await expect(listEventImportAccountCandidates(["", "   ", "Ltd"])).resolves.toEqual([]);
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("scopes the contact read to the accounts the file matched", async () => {
      const { listEventImportAccountContacts } = await import("../event-import");

      await listEventImportAccountContacts(["account-1", "account-2"]);

      const [sql, values] = queryMock.mock.calls[0]!;
      expect(String(sql).replace(/\s+/g, " ")).toContain("account_id = any($1::uuid[])");
      expect(values).toEqual([["account-1", "account-2"]]);
    });

    it("reads no contacts when the file matched no existing account", async () => {
      const { listEventImportAccountContacts } = await import("../event-import");

      await expect(listEventImportAccountContacts([])).resolves.toEqual([]);
      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  it("reuses a newly created account for later rows from the same unknown company", async () => {
    createAccountMock.mockResolvedValueOnce({ id: "account-1" });
    createAccountContactMock
      .mockResolvedValueOnce({ id: "contact-1" })
      .mockResolvedValueOnce({ id: "contact-2" });

    const { commitEventImport } = await import("../event-import");

    const result = await commitEventImport({
      campaignId: "campaign-1",
      owner: "owner-1",
      rows: [
        {
          company_name: "Fimmick HK Limited",
          contact_name: "Ada Wong",
          email: "ada@example.com",
          phone: "",
          attendee_status: "attended",
          interests: [],
          notes: "",
          account_match: { kind: "new" },
          contact_match: { kind: "new" },
        },
        {
          company_name: "Fimmick HK Ltd",
          contact_name: "Ben Chan",
          email: "ben@example.com",
          phone: "",
          attendee_status: "met",
          interests: [],
          notes: "",
          account_match: { kind: "new" },
          contact_match: { kind: "new" },
        },
      ],
    });

    expect(createAccountMock).toHaveBeenCalledTimes(1);
    expect(createAccountContactMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ account_id: "account-1", name: "Ben Chan" }),
      expect.anything(),
    );
    expect(createCampaignMemberMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ account_id: "account-1", attendee_status: "met" }),
      expect.anything(),
    );
    expect(result).toEqual({ createdAccounts: 1, createdContacts: 2, createdMembers: 2 });
  });

  it("reuses a matched contact instead of creating a duplicate", async () => {
    const { commitEventImport } = await import("../event-import");

    const result = await commitEventImport({
      campaignId: "campaign-1",
      owner: "owner-1",
      rows: [
        {
          company_name: "Fimmick",
          contact_name: "Ada Wong",
          email: "ada@example.com",
          phone: "",
          attendee_status: "attended",
          interests: [],
          notes: "",
          account_match: { kind: "matched", accountId: "account-1", matchedBy: "name" },
          contact_match: { kind: "matched", contactId: "contact-1", matchedBy: "email" },
        },
      ],
    });

    expect(createAccountMock).not.toHaveBeenCalled();
    expect(createAccountContactMock).not.toHaveBeenCalled();
    expect(createCampaignMemberMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: "account-1",
        contact_id: "contact-1",
      }),
      expect.anything(),
    );
    expect(result).toEqual({ createdAccounts: 0, createdContacts: 0, createdMembers: 1 });
  });
});
