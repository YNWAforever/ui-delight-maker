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

describe("backfill-accounts script", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("console", { ...console, log: mockConsoleLog, error: mockConsoleError });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates missing accounts and links clients inside one transaction", async () => {
    const db: MockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    mockQuery.mockResolvedValue([
      {
        id: "client-1",
        company_name: "Acme",
        industry: "Retail",
        tier: "SME",
        account_owner: "owner-1",
      },
    ]);
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "account-1", name: "Acme" });
    mockTransaction.mockImplementation(async (work: (db: MockDb) => Promise<void>) => work(db));

    const { backfillAccounts } = await import("../../../scripts/clientops/backfill-accounts");

    await backfillAccounts();

    expect(mockQuery).toHaveBeenCalledWith(
      "select * from clients where account_id is null order by company_name",
    );
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("select id, name from accounts"),
      ["Acme"],
      db,
    );
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("insert into accounts"),
      ["Acme", "Retail", "SME", "owner-1"],
      db,
    );
    expect(db.query).toHaveBeenCalledWith("update clients set account_id = $1 where id = $2", [
      "account-1",
      "client-1",
    ]);
    expect(mockConsoleLog).toHaveBeenCalledWith("Linked 1 client to accounts.");
  });

  it("reuses an existing account when the company already exists", async () => {
    const db: MockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    mockQuery.mockResolvedValue([
      {
        id: "client-1",
        company_name: "Acme",
        industry: "Retail",
        tier: "SME",
        account_owner: "owner-1",
      },
    ]);
    mockQueryOne.mockResolvedValueOnce({ id: "account-1", name: "Acme" });
    mockTransaction.mockImplementation(async (work: (db: MockDb) => Promise<void>) => work(db));

    const { backfillAccounts } = await import("../../../scripts/clientops/backfill-accounts");

    await backfillAccounts();

    expect(mockQueryOne).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith("update clients set account_id = $1 where id = $2", [
      "account-1",
      "client-1",
    ]);
    expect(mockConsoleLog).toHaveBeenCalledWith("Linked 1 client to accounts.");
  });
});
