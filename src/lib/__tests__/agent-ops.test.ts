import { describe, expect, it } from "vitest";

import { agentSuccessRate, buildAgentAttentionItems, isStuckRun } from "@/lib/agent-ops";
import { AGENT_RUN_STUCK_MINUTES } from "@/lib/agents";
import type { AgentRunSummary } from "@/server/read-models/agent-workspaces";

/**
 * The two derived numbers AI Ops puts in front of an operator.
 *
 * Both replace something that was not derived at all. The success rate replaces a card that
 * showed only a raw 24-hour run count next to an enable switch that did nothing, and the
 * attention queue replaces a flat "recent runs" table where a run wedged since yesterday
 * looked exactly like one that finished a second ago.
 *
 * Tested here rather than through the route because they are claims about what the page
 * asserts, and a claim proved only through markup is proved only for the branch the test
 * happened to mount.
 */

describe("success rate", () => {
  it("divides by settled runs, not by dispatched ones", () => {
    // Three completed, one failed, six still running: 75%, not 30%. Counting in-flight runs
    // as failures would show a success rate that fell whenever the agent got busy.
    expect(agentSuccessRate(3, 1)).toBeCloseTo(0.75);
  });

  it("is null, never zero, when nothing has settled", () => {
    // "No runs have finished yet" and "every run failed" are opposite facts.
    expect(agentSuccessRate(0, 0)).toBeNull();
    expect(agentSuccessRate(0, 2)).toBe(0);
  });
});

function run(overrides: Partial<AgentRunSummary> & { id: string }): AgentRunSummary {
  return {
    agent_name: "Lead Qualification Agent",
    trigger_type: "manual",
    output_summary: null,
    status: "completed",
    duration_ms: null,
    tokens_used: null,
    confidence_score: null,
    human_review_required: false,
    workflow_type: "qualify_lead",
    subject_type: "lead",
    subject_id: "lead-1",
    created_at: "2026-08-27T10:00:00.000Z",
    updated_at: "2026-08-27T10:00:00.000Z",
    ...overrides,
  };
}

const NOW = Date.parse("2026-08-27T12:00:00.000Z");
const SLUGS = new Map([["Lead Qualification Agent", "qualify-lead"]]);

describe("the attention queue", () => {
  it("orders stuck, then failed, then waiting approval", () => {
    const items = buildAgentAttentionItems(
      [
        run({ id: "approval", status: "waiting_approval" }),
        run({ id: "completed", status: "completed" }),
        run({ id: "failed", status: "failed" }),
        run({ id: "stuck", status: "running", created_at: "2026-08-27T09:00:00.000Z" }),
      ],
      SLUGS,
      NOW,
    );

    expect(items.map((item) => item.id)).toEqual(["stuck", "failed", "approval"]);
    expect(items.map((item) => item.severity)).toEqual(["stuck", "failure", "approval"]);
  });

  it("puts the oldest first inside a bucket, because it is a backlog", () => {
    const items = buildAgentAttentionItems(
      [
        run({ id: "newer", status: "failed", created_at: "2026-08-27T11:00:00.000Z" }),
        run({ id: "older", status: "failed", created_at: "2026-08-27T08:00:00.000Z" }),
      ],
      SLUGS,
      NOW,
    );

    expect(items.map((item) => item.id)).toEqual(["older", "newer"]);
  });

  it("calls a run stuck only once it is past the derived threshold", () => {
    const justStarted = run({
      id: "fresh",
      status: "running",
      created_at: new Date(NOW - (AGENT_RUN_STUCK_MINUTES - 5) * 60_000).toISOString(),
    });
    const wedged = run({
      id: "wedged",
      status: "running",
      created_at: new Date(NOW - (AGENT_RUN_STUCK_MINUTES + 5) * 60_000).toISOString(),
    });

    expect(isStuckRun(justStarted, NOW)).toBe(false);
    expect(isStuckRun(wedged, NOW)).toBe(true);
    expect(
      buildAgentAttentionItems([justStarted, wedged], SLUGS, NOW).map((item) => item.id),
    ).toEqual(["wedged"]);
  });

  it("ages nothing before the client clock resolves, so SSR and hydration agree", () => {
    // useClientNow() is null until after mount. A running run cannot be aged without a
    // clock, so it is simply absent rather than guessed at.
    const wedged = run({ id: "wedged", status: "running", created_at: "2026-08-27T01:00:00.000Z" });
    expect(buildAgentAttentionItems([wedged], SLUGS, null)).toEqual([]);
  });

  it("sends each row where its decision is actually made", () => {
    const items = buildAgentAttentionItems(
      [
        run({ id: "approval", status: "waiting_approval" }),
        run({ id: "failed", status: "failed" }),
        run({ id: "orphan", status: "failed", agent_name: "Retired Agent" }),
      ],
      SLUGS,
      NOW,
    );

    const byId = new Map(items.map((item) => [item.id, item.href]));
    // Approvals are decided in AI Review; a failed run is read in the agent's own history;
    // an agent_name the catalogue no longer has cannot resolve to a detail route.
    expect(byId.get("approval")).toBe("/ai-review");
    expect(byId.get("failed")).toBe("/agents/qualify-lead");
    expect(byId.get("orphan")).toBe("/agents");
  });

  it("never grows without bound", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      run({ id: `failed-${index}`, status: "failed" }),
    );
    expect(buildAgentAttentionItems(many, SLUGS, NOW, 8)).toHaveLength(8);
  });
});
