import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_DEFINITIONS } from "@/lib/agents";

const { queryMock, mockLoadEffectiveAgentCatalogue } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  mockLoadEffectiveAgentCatalogue: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({ query: queryMock }));
vi.mock("@/server/read-models/agent-catalogue", () => ({
  loadEffectiveAgentCatalogue: mockLoadEffectiveAgentCatalogue,
}));

const sqlText = (value: unknown) => String(value).replace(/\s+/g, " ").trim().toLowerCase();

describe("agent operations read model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([]);
    // Default: the plain catalogue, unmodified — existing tests below assert against
    // AGENT_DEFINITIONS reaching the output untouched, so the effective catalogue must equal it
    // unless a test overrides this mock.
    mockLoadEffectiveAgentCatalogue.mockResolvedValue(
      AGENT_DEFINITIONS.map((agent) => ({ ...agent })),
    );
  });

  it("returns fleet health, per-agent metrics, and a bounded attention queue", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          agent_name: "Lead Qualification Agent",
          runs_24h: "10",
          completed_24h: "8",
          failed_24h: "2",
          waiting_approval: "0",
          running: "1",
          stuck_runs: "1",
          avg_confidence: "0.8",
          confidence_samples_24h: "10",
          tokens_24h: "12000",
          last_run_at: "2026-08-26T01:00:00.000Z",
        },
        {
          agent_name: "Reply Draft Agent",
          runs_24h: "4",
          completed_24h: "3",
          failed_24h: "1",
          waiting_approval: "2",
          running: "0",
          stuck_runs: "0",
          avg_confidence: "0.9",
          confidence_samples_24h: "4",
          tokens_24h: "3000",
          last_run_at: "2026-08-26T00:30:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        { agent_name: "Lead Qualification Agent", hours_ago: "13", run_count: "1" },
        { agent_name: "Lead Qualification Agent", hours_ago: "0", run_count: "3" },
      ])
      .mockResolvedValueOnce([
        {
          id: "run-recent",
          agent_name: "Lead Qualification Agent",
          workflow_type: "qualify_lead",
          trigger_type: "manual",
          subject_type: "lead",
          subject_id: "11111111-1111-4111-8111-111111111111",
          output_summary: "Qualified",
          status: "completed",
          duration_ms: 1200,
          tokens_used: 400,
          confidence_score: 0.8,
          human_review_required: false,
          created_at: "2026-08-26T01:00:00.000Z",
          updated_at: "2026-08-26T01:00:01.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "run-stuck",
          agent_name: "Lead Qualification Agent",
          workflow_type: "qualify_lead",
          trigger_type: "schedule",
          subject_type: "lead",
          subject_id: "22222222-2222-4222-8222-222222222222",
          output_summary: null,
          status: "running",
          duration_ms: null,
          tokens_used: null,
          confidence_score: null,
          human_review_required: false,
          created_at: "2026-08-25T23:00:00.000Z",
          updated_at: "2026-08-25T23:10:00.000Z",
          attention_reason: "stuck",
          age_minutes: 110,
        },
      ]);

    const { loadAgentDirectoryRead, STUCK_RUN_MINUTES } = await import("../agent-workspaces");
    const result = await loadAgentDirectoryRead();

    expect(result.operations).toMatchObject({
      runs_24h: 14,
      completed_24h: 11,
      failed_24h: 3,
      waiting_approval: 2,
      running: 1,
      stuck_runs: 1,
      needs_attention: 6,
      tokens_24h: 15000,
    });
    expect(result.operations.success_rate).toBeCloseTo(11 / 14);
    expect(result.operations.avg_confidence).toBeCloseTo((0.8 * 10 + 0.9 * 4) / 14);

    const leadAgent = result.agents.find((agent) => agent.name === "qualify-lead");
    expect(leadAgent).toMatchObject({
      runs_24h: 10,
      completed_24h: 8,
      failed_24h: 2,
      success_rate: 0.8,
      running: 1,
      stuck_runs: 1,
      tokens_24h: 12000,
    });
    expect(leadAgent?.sparkline[0]).toBe(1);
    expect(leadAgent?.sparkline.at(-1)).toBe(3);
    expect(result.attentionRuns).toEqual([
      expect.objectContaining({ id: "run-stuck", attention_reason: "stuck", age_minutes: 110 }),
    ]);

    expect(queryMock).toHaveBeenCalledTimes(4);
    const aggregateSql = sqlText(queryMock.mock.calls[0]?.[0]);
    expect(aggregateSql).toContain("failed_24h");
    expect(aggregateSql).toContain("stuck_runs");
    expect(queryMock.mock.calls[0]?.[1]).toEqual([STUCK_RUN_MINUTES]);

    const attentionSql = sqlText(queryMock.mock.calls[3]?.[0]);
    expect(attentionSql).toContain("interval '7 days'");
    expect(attentionSql).toContain("limit $2");
    expect(queryMock.mock.calls[3]?.[1]).toEqual([STUCK_RUN_MINUTES, 25]);
  });

  it("keeps the full agent catalogue visible when no run data exists", async () => {
    const { loadAgentDirectoryRead } = await import("../agent-workspaces");
    const result = await loadAgentDirectoryRead();

    expect(result.agents).toHaveLength(5);
    expect(result.attentionRuns).toEqual([]);
    expect(result.recentRuns).toEqual([]);
    expect(result.operations).toEqual({
      runs_24h: 0,
      completed_24h: 0,
      failed_24h: 0,
      success_rate: null,
      waiting_approval: 0,
      running: 0,
      stuck_runs: 0,
      needs_attention: 0,
      tokens_24h: 0,
      avg_confidence: null,
    });
  });

  it("reports the effective status, not the catalogue status", async () => {
    // The regression this slice exists to fix: pausing an agent left /agents showing "Active"
    // because the read model mapped AGENT_DEFINITIONS directly.
    mockLoadEffectiveAgentCatalogue.mockResolvedValue(
      AGENT_DEFINITIONS.map((agent) =>
        agent.workflow_type === "qualify_lead" ? { ...agent, status: "inactive" } : agent,
      ),
    );

    const { loadAgentDirectoryRead } = await import("../agent-workspaces");
    const read = await loadAgentDirectoryRead();
    const qualify = read.agents.find((a) => a.workflow_type === "qualify_lead");

    expect(qualify?.status).toBe("inactive");
  });
});
