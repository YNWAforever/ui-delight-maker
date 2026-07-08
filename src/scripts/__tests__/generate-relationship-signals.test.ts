import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockBuildRelationshipSignals = vi.fn();
const mockQuery = vi.fn();
const mockListAccountContacts = vi.fn();
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

  it("loads all accounts directly and reuses a single active-product query across accounts", async () => {
    const accountOne = {
      id: "account-1",
      name: "Acme",
      lifecycle_stage: "active_client",
      account_owner: "owner-1",
    };
    const accountTwo = {
      id: "account-2",
      name: "Bravo",
      lifecycle_stage: "active_client",
      account_owner: "owner-2",
    };

    mockListAccountContacts
      .mockResolvedValueOnce([{ id: "contact-1" }])
      .mockResolvedValueOnce([{ id: "contact-2" }]);
    mockQuery
      .mockResolvedValueOnce([accountOne, accountTwo])
      .mockResolvedValueOnce([{ id: "product-1" }])
      .mockResolvedValueOnce([{ id: "engagement-1" }])
      .mockResolvedValueOnce([{ id: "quote-1" }])
      .mockResolvedValueOnce([{ id: "member-1" }])
      .mockResolvedValueOnce([{ id: "engagement-2" }])
      .mockResolvedValueOnce([{ id: "quote-2" }])
      .mockResolvedValueOnce([{ id: "member-2" }]);
    mockBuildRelationshipSignals
      .mockReturnValueOnce([{ dedupe_key: "signal-1" }, { dedupe_key: "signal-2" }])
      .mockReturnValueOnce([{ dedupe_key: "signal-3" }]);
    mockUpsertRelationshipSignals
      .mockResolvedValueOnce([{ id: "signal-1" }, { id: "signal-2" }])
      .mockResolvedValueOnce([{ id: "signal-3" }]);

    const { generateRelationshipSignals } = await import(
      "../../../scripts/clientops/generate-relationship-signals"
    );

    await generateRelationshipSignals();

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      "select * from accounts order by coalesce(last_activity_at, created_at) desc",
    );
    expect(mockQuery).toHaveBeenNthCalledWith(2, "select * from products where active = true", []);
    expect(mockQuery).toHaveBeenCalledTimes(8);
    expect(mockListAccountContacts).toHaveBeenCalledWith("account-1");
    expect(mockListAccountContacts).toHaveBeenCalledWith("account-2");
    expect(mockQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("join clients c on c.id = e.client_id"),
      ["account-1"],
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      4,
      "select * from quotes where account_id = $1",
      ["account-1"],
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      5,
      "select * from campaign_members where account_id = $1",
      ["account-1"],
    );
    expect(mockBuildRelationshipSignals).toHaveBeenCalledWith({
      account: accountOne,
      contacts: [{ id: "contact-1" }],
      engagements: [{ id: "engagement-1" }],
      quotes: [{ id: "quote-1" }],
      campaignMembers: [{ id: "member-1" }],
      products: [{ id: "product-1" }],
      now: new Date("2026-07-08T10:00:00.000Z"),
    });
    expect(mockBuildRelationshipSignals).toHaveBeenCalledWith({
      account: accountTwo,
      contacts: [{ id: "contact-2" }],
      engagements: [{ id: "engagement-2" }],
      quotes: [{ id: "quote-2" }],
      campaignMembers: [{ id: "member-2" }],
      products: [{ id: "product-1" }],
      now: new Date("2026-07-08T10:00:00.000Z"),
    });
    expect(mockUpsertRelationshipSignals).toHaveBeenCalledWith("account-1", [
      { dedupe_key: "signal-1" },
      { dedupe_key: "signal-2" },
    ]);
    expect(mockUpsertRelationshipSignals).toHaveBeenCalledWith("account-2", [
      { dedupe_key: "signal-3" },
    ]);
    expect(mockConsoleLog).toHaveBeenCalledWith("Generated or updated 3 relationship signals.");
  });
});
