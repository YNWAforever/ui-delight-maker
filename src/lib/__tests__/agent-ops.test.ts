import { describe, expect, it } from "vitest";

import { agentSuccessRate, buildAgentAttentionItems, isStuckRun } from "@/lib/agent-ops";
import { AGENT_RUN_STUCK_MINUTES } from "@/lib/agents";
import * as agents from "@/lib/agents";
import type { AgentDirectoryRunSummary } from "@/server/read-models/agent-workspaces";

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

function run(
  overrides: Partial<AgentDirectoryRunSummary> & { id: string },
): AgentDirectoryRunSummary {
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
    subject_restricted: false,
    created_at: "2026-08-27T10:00:00.000Z",
    updated_at: "2026-08-27T10:00:00.000Z",
    ...overrides,
  };
}

const NOW = Date.parse("2026-08-27T12:00:00.000Z");
const SLUGS = new Map([["Lead Qualification Agent", "qualify-lead"]]);

describe("the attention queue", () => {
  it("uses_created_at_at_exact_60_minutes", () => {
    for (const [seconds, expected] of [
      [899, false],
      [900, false],
      [3599, false],
      [3600, true],
      [3601, true],
    ] as const) {
      expect(
        isStuckRun(
          run({
            id: String(seconds),
            status: "running",
            created_at: new Date(NOW - seconds * 1000).toISOString(),
            updated_at: new Date(NOW).toISOString(),
          }),
          NOW,
        ),
      ).toBe(expected);
    }
  });

  it("groups_legacy_names_by_workflow for attention links", () => {
    const items = buildAgentAttentionItems(
      [
        run({
          id: "legacy",
          workflow_type: "draft_quote",
          agent_name: "Quotation Agent",
          status: "failed",
        }),
        run({
          id: "current",
          workflow_type: "draft_quote",
          agent_name: "Quote Draft Agent",
          status: "failed",
        }),
      ],
      new Map(),
      NOW,
    );
    expect(items.map((item) => item.href)).toEqual(["/agents/draft-quote", "/agents/draft-quote"]);
    expect(items.map((item) => item.title)).toEqual(["Quotation Agent", "Quote Draft Agent"]);
  });

  it("keeps_unknown_workflows_unmapped even with a known display name", () => {
    expect(agents).toHaveProperty("agentSlugForWorkflowType");
    const slug = (
      agents as unknown as { agentSlugForWorkflowType: (value: string) => string | null }
    ).agentSlugForWorkflowType;
    expect(slug("draft_quote")).toBe("draft-quote");
    expect(slug("unknown_workflow")).toBeNull();
    expect(slug("note_tidy")).toBeNull();
    expect(
      buildAgentAttentionItems(
        [run({ id: "unknown", workflow_type: "unknown_workflow", status: "failed" })],
        SLUGS,
        NOW,
      )[0].href,
    ).toBe("/agents");
  });

  it("matches_attention_count_to_rows across the inclusive seven-day failure window", () => {
    const items = buildAgentAttentionItems(
      [25 * 3600, 6 * 86400, 7 * 86400, 7 * 86400 + 1].map((seconds) =>
        run({
          id: String(seconds),
          status: "failed",
          created_at: new Date(NOW - seconds * 1000).toISOString(),
        }),
      ),
      SLUGS,
      NOW,
    );
    expect(items.map((item) => item.id)).toEqual([
      String(7 * 86400),
      String(6 * 86400),
      String(25 * 3600),
    ]);
  });
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
        run({
          id: "orphan",
          status: "failed",
          agent_name: "Retired Agent",
          workflow_type: "retired_unknown",
        }),
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

  it("says the summary is restricted rather than 'recorded no summary' on a redacted failure", () => {
    // loadAgentDirectoryRead nulls output_summary the same way for a restricted row and a
    // genuinely empty one. Without subject_restricted, a redaction reads as "the run recorded
    // no summary" — which is false, not merely uninformative.
    const items = buildAgentAttentionItems(
      [
        run({
          id: "restricted",
          status: "failed",
          subject_restricted: true,
          output_summary: null,
        }),
      ],
      SLUGS,
      NOW,
    );

    expect(items[0].reason).toBe("Summary restricted.");
  });

  it("still reports a genuinely empty summary as such, when the row is not restricted", () => {
    const items = buildAgentAttentionItems(
      [run({ id: "empty", status: "failed", subject_restricted: false, output_summary: null })],
      SLUGS,
      NOW,
    );

    expect(items[0].reason).toBe("The run failed and recorded no summary.");
  });
});
