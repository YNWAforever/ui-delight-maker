import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockBuildRelationshipSignals = vi.fn();
const mockQuery = vi.fn();
const mockListAccountContacts = vi.fn();
const mockListAccounts = vi.fn();
const mockUpsertRelationshipSignals = vi.fn();
const mockConsoleLog = vi.fn();
const mockConsoleError = vi.fn();

vi.mock("../../../src/lib/relationship/signals", () => ({
  buildRelationshipSignals: mockBuildRelationshipSignals,
}));

vi.mock("../../../src/server/db/neon.server", () => ({
  query: mockQuery,
}));

vi.mock("../../../src/server/repositories/account-contacts", () => ({
  listAccountContacts: mockListAccountContacts,
}));

vi.mock("../../../src/server/repositories/accounts", () => ({
  listAccounts: mockListAccounts,
}));

vi.mock("../../../src/server/repositories/relationship-signals", () => ({
  upsertRelationshipSignals: mockUpsertRelationshipSignals,
}));

describe("generate-relationship-signals script", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T10:00:00.000Z"));
    vi.stubGlobal("console", { ...console, log: mockConsoleLog, error: mockConsoleError });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("builds and persists signals for each account", async () => {
    const account = {
      id: "account-1",
      name: "Acme",
      lifecycle_stage: "active_client",
      account_owner: "owner-1",
    };

    mockListAccounts.mockResolvedValue([account]);
    mockListAccountContacts.mockResolvedValue([{ id: "contact-1" }]);
    mockQuery
      .mockResolvedValueOnce([{ id: "engagement-1" }])
      .mockResolvedValueOnce([{ id: "quote-1" }])
      .mockResolvedValueOnce([{ id: "member-1" }])
      .mockResolvedValueOnce([{ id: "product-1" }]);
    mockBuildRelationshipSignals.mockReturnValue([
      { dedupe_key: "signal-1" },
      { dedupe_key: "signal-2" },
    ]);
    mockUpsertRelationshipSignals.mockResolvedValue([{ id: "signal-1" }, { id: "signal-2" }]);

    const { generateRelationshipSignals } = await import(
      "../../../scripts/clientops/generate-relationship-signals"
    );

    await generateRelationshipSignals();

    expect(mockListAccounts).toHaveBeenCalledWith({});
    expect(mockListAccountContacts).toHaveBeenCalledWith("account-1");
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("join clients c on c.id = e.client_id"),
      ["account-1"],
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      "select * from quotes where account_id = $1",
      ["account-1"],
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      3,
      "select * from campaign_members where account_id = $1",
      ["account-1"],
    );
    expect(mockQuery).toHaveBeenNthCalledWith(4, "select * from products where active = true", []);
    expect(mockBuildRelationshipSignals).toHaveBeenCalledWith({
      account,
      contacts: [{ id: "contact-1" }],
      engagements: [{ id: "engagement-1" }],
      quotes: [{ id: "quote-1" }],
      campaignMembers: [{ id: "member-1" }],
      products: [{ id: "product-1" }],
      now: new Date("2026-07-08T10:00:00.000Z"),
    });
    expect(mockUpsertRelationshipSignals).toHaveBeenCalledWith("account-1", [
      { dedupe_key: "signal-1" },
      { dedupe_key: "signal-2" },
    ]);
    expect(mockConsoleLog).toHaveBeenCalledWith("Generated or updated 2 relationship signals.");
  });
});
