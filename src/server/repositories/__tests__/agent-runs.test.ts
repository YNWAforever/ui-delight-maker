import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQueryOne } = vi.hoisted(() => ({ mockQueryOne: vi.fn() }));

vi.mock("@/server/db/neon.server", () => ({
  query: vi.fn(),
  queryOne: mockQueryOne,
  transaction: vi.fn(),
}));

const { updateAgentRunResult } = await import("../agent-runs");

describe("updateAgentRunResult", () => {
  beforeEach(() => {
    mockQueryOne.mockReset();
    mockQueryOne.mockResolvedValue({ id: "run-1" });
  });

  it("computes duration_ms in SQL rather than taking it from the caller", async () => {
    // Four of the five writebacks never passed a duration, so the column was null for them.
    // Computing it here means no caller can forget.
    await updateAgentRunResult("run-1", { status: "completed" });

    const [sql] = mockQueryOne.mock.calls[0];
    expect(String(sql)).toContain("extract(epoch from (now() - created_at))");
    // No positional parameter for duration any more.
    expect(String(sql)).not.toContain("duration_ms = $");
  });

  it("uses now(), not clock_timestamp()", async () => {
    // now() is transaction-start: the moment the callback began processing. clock_timestamp()
    // would fold the writeback's own earlier work in the same transaction into the agent's
    // measured time. This test exists because a reader who knows that difference is likely to
    // "correct" the code in the wrong direction.
    await updateAgentRunResult("run-1", { status: "completed" });

    const [sql] = mockQueryOne.mock.calls[0];
    expect(String(sql)).not.toContain("clock_timestamp");
  });

  it("passes the remaining values in the renumbered positions", async () => {
    // The UPDATE uses positional parameters and the values array is unknown[], so TypeScript
    // cannot catch a shuffle here. Removing duration_ms moved tokens_used to $7 and
    // model_used to $8.
    await updateAgentRunResult("run-1", {
      status: "completed",
      output_summary: "done",
      confidence_score: 0.9,
      human_review_required: false,
      tokens_used: 1234,
      model_used: "anthropic/claude-sonnet-4-6",
    });

    const [, values] = mockQueryOne.mock.calls[0];
    expect(values).toEqual([
      "run-1",
      "completed",
      null,
      "done",
      0.9,
      false,
      1234,
      "anthropic/claude-sonnet-4-6",
    ]);
  });
});
