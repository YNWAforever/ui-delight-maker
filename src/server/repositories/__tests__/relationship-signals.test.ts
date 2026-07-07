import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

describe("relationship signals repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists open signals with filters and severity ordering", async () => {
    mockQuery.mockResolvedValue([]);
    const { listRelationshipSignals } = await import("../relationship-signals");

    await listRelationshipSignals({
      account_id: "account-1",
      signal_type: "missing_champion",
      openOnly: true,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("from relationship_signals"),
      ["account-1", "missing_champion"],
    );
    expect(mockQuery.mock.calls[0][0]).toContain("dismissed_at is null");
  });

  it("upserts relationship signals with explanation fields intact", async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: "signal-1" })
      .mockResolvedValueOnce({ id: "signal-2" });
    const { upsertRelationshipSignals } = await import("../relationship-signals");

    const rows = await upsertRelationshipSignals("account-1", [
      {
        account_id: "account-1",
        signal_type: "missing_champion",
        severity: "medium",
        title: "Champion missing",
        reason: "No champion is mapped.",
        suggested_action: "Assign a champion.",
        source: "deterministic",
        dedupe_key: "missing-champion",
      },
      {
        account_id: "account-1",
        signal_type: "stale_touchpoint",
        severity: "high",
        title: "Touchpoint stale",
        reason: "No recent touchpoint.",
        suggested_action: null,
        source: "ai",
        dedupe_key: "stale-touchpoint-60",
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(mockQueryOne).toHaveBeenCalledTimes(2);
    expect(mockQueryOne.mock.calls[0][0]).toContain("on conflict (account_id, signal_type, dedupe_key)");
    expect(mockQueryOne.mock.calls[0][1]).toEqual([
      "account-1",
      "missing_champion",
      "medium",
      "Champion missing",
      "No champion is mapped.",
      "Assign a champion.",
      "deterministic",
      "missing-champion",
    ]);
  });

  it("dismisses a signal with actor and reason", async () => {
    mockQueryOne.mockResolvedValue({ id: "signal-1" });
    const { dismissRelationshipSignal } = await import("../relationship-signals");

    const row = await dismissRelationshipSignal("signal-1", {
      dismissed_by: "user-1",
      dismissal_reason: "already handled",
    });

    expect(row).toEqual({ id: "signal-1" });
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("update relationship_signals"),
      ["signal-1", "user-1", "already handled"],
      undefined,
    );
  });
});
