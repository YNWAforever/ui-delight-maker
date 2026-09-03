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

  describe("loadAgentHistoryPage", () => {
    const row = (id: string, subjectType: string) => ({
      id,
      agent_name: "Qualification Agent",
      workflow_type: "qualify_lead",
      trigger_type: "manual",
      subject_type: subjectType,
      subject_id: "00000000-0000-0000-0000-000000000001",
      input_data: { lead_id: "secret-lead", notes: "commercially sensitive" },
      output_summary: "Qualified",
      status: "completed",
      duration_ms: 1200,
      tokens_used: 900,
      confidence_score: 0.8,
      human_review_required: false,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    });

    const seed = (rows: ReturnType<typeof row>[]) => {
      queryMock
        .mockResolvedValueOnce([{ total: rows.length }])
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([{ runs_24h: rows.length, avg_confidence: 0.8 }]);
    };

    it("keeps input_data when the actor holds that row's subject capability", async () => {
      const { loadAgentHistoryPage } = await import("../agent-workspaces");
      seed([row("run-1", "lead")]);

      const page = await loadAgentHistoryPage({
        agent: "Qualification Agent",
        page: 1,
        limit: 25,
        access: { "agents.view": true, "leads.view": true },
      });

      expect(page.items[0].subject_restricted).toBe(false);
      expect(page.items[0].input_data).toEqual({
        lead_id: "secret-lead",
        notes: "commercially sensitive",
      });
      expect(page.items[0].output_summary).toBe("Qualified");
    });

    it("blanks the run's content when the actor lacks that row's subject capability", async () => {
      const { loadAgentHistoryPage } = await import("../agent-workspaces");
      seed([row("run-1", "lead")]);

      const page = await loadAgentHistoryPage({
        agent: "Qualification Agent",
        page: 1,
        limit: 25,
        access: { "agents.view": true, "leads.view": false },
      });

      expect(page.items[0].subject_restricted).toBe(true);
      expect(page.items[0].input_data).toBeNull();
      expect(page.items[0].output_summary).toBeNull();
    });

    it("nulls subject_id and subject_type on a restricted row, not just the content", async () => {
      // The id is the identity: per quote-workspace.ts's redactLeadIdentity, a restricted row
      // that still ships which record the agent ran against redacts nothing.
      const { loadAgentHistoryPage } = await import("../agent-workspaces");
      seed([row("run-1", "lead")]);

      const page = await loadAgentHistoryPage({
        agent: "Qualification Agent",
        page: 1,
        limit: 25,
        access: { "agents.view": true, "leads.view": false },
      });

      expect(page.items[0].subject_id).toBeNull();
      expect(page.items[0].subject_type).toBeNull();
    });

    it("preserves subject_id and subject_type on a permitted row", async () => {
      const { loadAgentHistoryPage } = await import("../agent-workspaces");
      seed([row("run-1", "lead")]);

      const page = await loadAgentHistoryPage({
        agent: "Qualification Agent",
        page: 1,
        limit: 25,
        access: { "agents.view": true, "leads.view": true },
      });

      expect(page.items[0].subject_id).toBe("00000000-0000-0000-0000-000000000001");
      expect(page.items[0].subject_type).toBe("lead");
    });

    it("redacts per row, not per page", async () => {
      const { loadAgentHistoryPage } = await import("../agent-workspaces");
      seed([row("run-lead", "lead"), row("run-account", "account")]);

      const page = await loadAgentHistoryPage({
        agent: "Qualification Agent",
        page: 1,
        limit: 25,
        access: { "agents.view": true, "leads.view": true, "accounts.view": false },
      });

      expect(page.items[0].subject_restricted).toBe(false);
      expect(page.items[0].output_summary).toBe("Qualified");
      expect(page.items[1].subject_restricted).toBe(true);
      expect(page.items[1].input_data).toBeNull();
      expect(page.items[1].output_summary).toBeNull();
    });

    it("blanks the run's content for a subject_type the capability table does not name", async () => {
      const { loadAgentHistoryPage } = await import("../agent-workspaces");
      seed([row("run-1", "job_sheet")]);

      const page = await loadAgentHistoryPage({
        agent: "Qualification Agent",
        page: 1,
        limit: 25,
        access: {
          "agents.view": true,
          "leads.view": true,
          "accounts.view": true,
          "campaigns.view": true,
          "quotes.view": true,
          "engagements.view": true,
          "tasks.view": true,
          "approvals.view": true,
        },
      });

      expect(page.items[0].subject_restricted).toBe(true);
      expect(page.items[0].input_data).toBeNull();
      expect(page.items[0].output_summary).toBeNull();
    });

    it("never selects or returns output_data", async () => {
      const { loadAgentHistoryPage } = await import("../agent-workspaces");
      seed([row("run-1", "lead")]);

      const page = await loadAgentHistoryPage({
        agent: "Qualification Agent",
        page: 1,
        limit: 25,
        access: { "agents.view": true, "leads.view": true },
      });

      const sql = sqlText(queryMock.mock.calls[1][0]);
      expect(sql).not.toContain("select *");
      expect(sql).not.toContain("output_data");
      expect(page.items[0]).not.toHaveProperty("output_data");
    });

    it("still issues exactly three queries", async () => {
      const { loadAgentHistoryPage } = await import("../agent-workspaces");
      seed([row("run-1", "lead")]);

      await loadAgentHistoryPage({
        agent: "Qualification Agent",
        page: 1,
        limit: 25,
        access: { "agents.view": true, "leads.view": true },
      });

      // Redaction is in-memory. If this number moves, the page has started resolving
      // ownership per row, which the agents.$name maxQueries budget cannot absorb.
      expect(queryMock).toHaveBeenCalledTimes(3);
    });
  });
});
