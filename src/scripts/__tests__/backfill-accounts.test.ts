import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockDb = {
  query: (text: string, values?: readonly unknown[]) => Promise<{ rows: unknown[] }>;
};

const mockQuery = vi.fn();
const mockQueryOne = vi.fn();
const mockTransaction = vi.fn();
const mockConsoleLog = vi.fn();
const mockConsoleError = vi.fn();

vi.mock("../../../src/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
  transaction: mockTransaction,
}));

const ACME = {
  id: "client-1",
  company_name: "Acme",
  industry: "Retail",
  tier: "SME",
  account_owner: "owner-1",
};

const GLOBEX = {
  id: "client-2",
  company_name: "Globex",
  industry: "Manufacturing",
  tier: "enterprise",
  account_owner: "owner-2",
};

async function loadScript() {
  const module = await import("../../../scripts/clientops/backfill-accounts");
  return module.backfillAccounts;
}

/** Every `text` argument the script issued, from both `queryOne` and the transaction handle. */
function sqlIssued(db: MockDb): string[] {
  const transactional = vi.mocked(db.query).mock.calls.map(([text]) => text);
  const viaQueryOne = mockQueryOne.mock.calls.map(([text]) => text as string);
  return [...transactional, ...viaQueryOne];
}

function matching(db: MockDb, pattern: RegExp): string[] {
  return sqlIssued(db).filter((text) => pattern.test(text));
}

/** Calls to the transaction handle whose SQL matches, as `[text, values]` pairs. */
function callsMatching(db: MockDb, pattern: RegExp): Array<[string, readonly unknown[]]> {
  return vi.mocked(db.query).mock.calls.filter(([text]) => pattern.test(text as string)) as Array<
    [string, readonly unknown[]]
  >;
}

const UPDATE_CLIENTS = /update clients set account_id/;
const INSERT_ACCOUNTS = /insert into accounts/;
const INSERT_ACTIVITY = /insert into activity_logs/;

describe("backfill-accounts script", () => {
  let db: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("console", { ...console, log: mockConsoleLog, error: mockConsoleError });
    db = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    mockTransaction.mockImplementation(async (work: (db: MockDb) => Promise<void>) => work(db));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("dry run (no flags)", () => {
    it("writes nothing at all, but still reports what it would do", async () => {
      mockQuery.mockResolvedValue([ACME, GLOBEX]);
      // Acme has no name-matching account; Globex does.
      mockQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "account-2", name: "Globex" });

      const backfillAccounts = await loadScript();
      const report = await backfillAccounts();

      // The report still describes the full plan.
      expect(report.toCreate).toEqual([{ clientId: "client-1", companyName: "Acme" }]);
      expect(report.toMatch).toEqual([
        {
          clientId: "client-2",
          companyName: "Globex",
          accountId: "account-2",
          accountName: "Globex",
        },
      ]);
      expect(report.created).toBe(0);
      expect(report.matched).toBe(0);

      // Assert on the SQL, not the counts: no write statement of any kind was issued.
      expect(matching(db, UPDATE_CLIENTS)).toEqual([]);
      expect(matching(db, INSERT_ACCOUNTS)).toEqual([]);
      expect(matching(db, INSERT_ACTIVITY)).toEqual([]);

      // A dry run must not even open a transaction.
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(db.query).not.toHaveBeenCalled();

      // The only statements issued were the two reads used to build the plan.
      expect(mockQuery).toHaveBeenCalledWith(
        "select * from clients where account_id is null order by company_name",
      );
      expect(mockQueryOne).toHaveBeenCalledTimes(2);
      expect(
        mockQueryOne.mock.calls.every(([text]) =>
          (text as string).startsWith("select id, name from accounts"),
        ),
      ).toBe(true);

      const output = mockConsoleLog.mock.calls.map(([line]) => String(line)).join("\n");
      expect(output).toContain("DRY RUN — nothing was written.");
      expect(output).toContain("--apply");
    });
  });

  describe("--apply", () => {
    it("creates and links the unmatched client, and issues no update for the matched one", async () => {
      mockQuery.mockResolvedValue([ACME, GLOBEX]);
      mockQueryOne
        // plan: Acme unmatched, Globex matched
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "account-2", name: "Globex" })
        // write: the account created for Acme
        .mockResolvedValueOnce({ id: "account-1", name: "Acme" });

      const backfillAccounts = await loadScript();
      const report = await backfillAccounts({ apply: true });

      // The SQL comes first, deliberately. The returned counts would still read correctly
      // if a write leaked through, so the statement list is the assertion that has to hold.
      //
      // Exactly one client was linked, and it is the created one — client-2 was not touched.
      const updates = callsMatching(db, UPDATE_CLIENTS);
      expect(updates).toEqual([
        ["update clients set account_id = $1 where id = $2", ["account-1", "client-1"]],
      ]);
      const updatedClientIds = updates.map(([, values]) => values[1]);
      expect(updatedClientIds).toContain("client-1");
      expect(updatedClientIds).not.toContain("client-2");

      // And no update was issued naming the pre-existing account it was proposed against.
      expect(updates.some(([, values]) => values[0] === "account-2")).toBe(false);

      // Nor was the match recorded as though it had happened.
      const logs = callsMatching(db, INSERT_ACTIVITY);
      expect(logs).toHaveLength(1);
      expect(logs.some(([, values]) => String(values[2]).includes("matched"))).toBe(false);

      // The create path ran, with the client's own fields.
      expect(mockQueryOne).toHaveBeenLastCalledWith(
        expect.stringContaining("insert into accounts"),
        ["Acme", "Retail", "SME", "owner-1"],
        db,
      );

      expect(report.created).toBe(1);
      expect(report.matched).toBe(0);
      // The match is still reported, for a human to review.
      expect(report.toMatch).toEqual([
        {
          clientId: "client-2",
          companyName: "Globex",
          accountId: "account-2",
          accountName: "Globex",
        },
      ]);
    });

    it("performs no writes when every client already has a name-matching account", async () => {
      mockQuery.mockResolvedValue([GLOBEX]);
      mockQueryOne.mockResolvedValueOnce({ id: "account-2", name: "Globex" });

      const backfillAccounts = await loadScript();
      const report = await backfillAccounts({ apply: true });

      expect(matching(db, UPDATE_CLIENTS)).toEqual([]);
      expect(matching(db, INSERT_ACCOUNTS)).toEqual([]);
      expect(matching(db, INSERT_ACTIVITY)).toEqual([]);

      expect(report.created).toBe(0);
      expect(report.matched).toBe(0);
      expect(report.toMatch).toHaveLength(1);
    });
  });

  describe("--apply --confirm-matches", () => {
    it("performs the match as well as the create", async () => {
      mockQuery.mockResolvedValue([ACME, GLOBEX]);
      mockQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "account-2", name: "Globex" })
        .mockResolvedValueOnce({ id: "account-1", name: "Acme" });

      const backfillAccounts = await loadScript();
      const report = await backfillAccounts({ apply: true, confirmMatches: true });

      expect(report.created).toBe(1);
      expect(report.matched).toBe(1);

      const updates = callsMatching(db, UPDATE_CLIENTS);
      expect(updates).toEqual([
        ["update clients set account_id = $1 where id = $2", ["account-1", "client-1"]],
        ["update clients set account_id = $1 where id = $2", ["account-2", "client-2"]],
      ]);
    });
  });

  describe("audit trail", () => {
    it("writes an activity_logs row for every performed link, saying created or matched", async () => {
      mockQuery.mockResolvedValue([ACME, GLOBEX]);
      mockQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "account-2", name: "Globex" })
        .mockResolvedValueOnce({ id: "account-1", name: "Acme" });

      const backfillAccounts = await loadScript();
      await backfillAccounts({ apply: true, confirmMatches: true });

      const logs = callsMatching(db, INSERT_ACTIVITY);
      // One row per link, no more and no fewer.
      expect(logs).toHaveLength(2);
      expect(logs).toHaveLength(callsMatching(db, UPDATE_CLIENTS).length);

      const rows = logs.map(([text, values]) => {
        expect(text).toContain("'client'");
        expect(text).toContain("'user'");
        const [actorId, , action, objectId, diff] = values as [
          string,
          string,
          string,
          string,
          string,
        ];
        return { actorId, action, objectId, diff: JSON.parse(diff) as Record<string, unknown> };
      });

      expect(rows[0].action).toContain("created");
      expect(rows[0].objectId).toBe("client-1");
      expect(rows[0].diff).toMatchObject({
        mode: "created",
        client_id: "client-1",
        company_name: "Acme",
        account_id: "account-1",
        account_name: "Acme",
      });

      expect(rows[1].action).toContain("matched");
      expect(rows[1].objectId).toBe("client-2");
      expect(rows[1].diff).toMatchObject({
        mode: "matched",
        client_id: "client-2",
        company_name: "Globex",
        account_id: "account-2",
        account_name: "Globex",
      });

      // A created link must never be recorded as matched, or the audit is worthless.
      expect(rows[0].action).not.toContain("matched");
      expect(rows[1].action).not.toContain("created");
    });

    it("records the created link even when matches are withheld", async () => {
      mockQuery.mockResolvedValue([ACME, GLOBEX]);
      mockQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "account-2", name: "Globex" })
        .mockResolvedValueOnce({ id: "account-1", name: "Acme" });

      const backfillAccounts = await loadScript();
      await backfillAccounts({ apply: true });

      const logs = callsMatching(db, INSERT_ACTIVITY);
      expect(logs).toHaveLength(1);
      expect(logs[0][1][2]).toContain("created");
      expect(logs[0][1][3]).toBe("client-1");
    });
  });

  describe("safety", () => {
    it("refuses to apply when two account-less clients share a company name", async () => {
      mockQuery.mockResolvedValue([ACME, { ...ACME, id: "client-3" }]);
      mockQueryOne.mockResolvedValue(null);

      const backfillAccounts = await loadScript();

      await expect(backfillAccounts({ apply: true })).rejects.toThrow(/Refusing to apply/);
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(matching(db, INSERT_ACCOUNTS)).toEqual([]);
    });

    it("keeps every write inside one transaction", async () => {
      mockQuery.mockResolvedValue([ACME]);
      mockQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "account-1", name: "Acme" });

      const backfillAccounts = await loadScript();
      await backfillAccounts({ apply: true });

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });
  });
});
