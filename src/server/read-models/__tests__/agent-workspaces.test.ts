import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_DEFINITIONS } from "@/lib/agents";
import type { RowAuthorizer } from "@/server/auth/authorization.server";

const { queryMock, mockLoadEffectiveAgentCatalogue } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  mockLoadEffectiveAgentCatalogue: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({ query: queryMock }));
vi.mock("@/server/read-models/agent-catalogue", () => ({
  loadEffectiveAgentCatalogue: mockLoadEffectiveAgentCatalogue,
}));

const sqlText = (value: unknown) => String(value).replace(/\s+/g, " ").trim().toLowerCase();

/**
 * A stubbed `RowAuthorizer` whose `allow` answers from a fixed `resourceType:id` -> verdict
 * map, defaulting to `fallback` for any pair not named.
 *
 * Keyed on `resourceType`, not just `id`: the read models under test seed rows that
 * deliberately share one `subject_id` across two different `subject_type`s (mirroring
 * `agent-run-visibility.test.ts`'s own fixtures), and a row-level authorizer has to be able to
 * allow one and deny the other even though the id alone does not distinguish them.
 */
function stubRows(
  verdicts: Record<string, boolean> = {},
  fallback = false,
): RowAuthorizer & { allow: ReturnType<typeof vi.fn> } {
  const allow = vi.fn(async (_capability: string, resourceType: string, ids: readonly string[]) => {
    const decided = new Map<string, boolean>();
    for (const id of ids) decided.set(id, verdicts[`${resourceType}:${id}`] ?? fallback);
    return decided;
  });
  return { allow };
}

/** For tests that do not exercise redaction: every subject is allowed. */
const allowAllRows = () => stubRows({}, true);

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
    const result = await loadAgentDirectoryRead({}, allowAllRows());

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
    const result = await loadAgentDirectoryRead({}, allowAllRows());

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
    const read = await loadAgentDirectoryRead({}, allowAllRows());
    const qualify = read.agents.find((a) => a.workflow_type === "qualify_lead");

    expect(qualify?.status).toBe("inactive");
  });

  describe("loadAgentHistoryPage", () => {
    const row = (
      id: string,
      subjectType: string,
      subjectId = "00000000-0000-0000-0000-000000000001",
    ) => ({
      id,
      agent_name: "Qualification Agent",
      workflow_type: "qualify_lead",
      trigger_type: "manual",
      subject_type: subjectType,
      subject_id: subjectId,
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
        access: {},
        rows: stubRows({ "lead:00000000-0000-0000-0000-000000000001": true }),
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
        access: {},
        rows: stubRows(),
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
        access: {},
        rows: stubRows(),
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
        access: {},
        rows: stubRows({ "lead:00000000-0000-0000-0000-000000000001": true }),
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
        access: {},
        rows: stubRows({
          "lead:00000000-0000-0000-0000-000000000001": true,
          "account:00000000-0000-0000-0000-000000000001": false,
        }),
      });

      expect(page.items[0].subject_restricted).toBe(false);
      expect(page.items[0].output_summary).toBe("Qualified");
      expect(page.items[1].subject_restricted).toBe(true);
      expect(page.items[1].input_data).toBeNull();
      expect(page.items[1].output_summary).toBeNull();
    });

    it("redacts a denied subject's row without redacting a sibling row of the same subject type", async () => {
      // This is the load-bearing case: a `deny` override scoped to one specific lead has been
      // inert on this list since PR #75, because the old check only ever asked "can this actor
      // see leads at all" — which is the same answer for every row of the same subject_type.
      // Two rows of the *same* type with different subject_ids and different verdicts is the
      // one shape a capability-level access map could never produce.
      const { loadAgentHistoryPage } = await import("../agent-workspaces");
      seed([
        row("run-allowed", "lead", "00000000-0000-0000-0000-000000000011"),
        row("run-denied", "lead", "00000000-0000-0000-0000-000000000012"),
      ]);

      const page = await loadAgentHistoryPage({
        agent: "Qualification Agent",
        page: 1,
        limit: 25,
        access: {},
        rows: stubRows({
          "lead:00000000-0000-0000-0000-000000000011": true,
          "lead:00000000-0000-0000-0000-000000000012": false,
        }),
      });

      expect(page.items[0].subject_restricted).toBe(false);
      expect(page.items[0].output_summary).toBe("Qualified");
      expect(page.items[0].subject_id).toBe("00000000-0000-0000-0000-000000000011");
      expect(page.items[1].subject_restricted).toBe(true);
      expect(page.items[1].output_summary).toBeNull();
      expect(page.items[1].input_data).toBeNull();
      expect(page.items[1].subject_id).toBeNull();
    });

    it("blanks the run's content for a subject_type the capability table does not name", async () => {
      const { loadAgentHistoryPage } = await import("../agent-workspaces");
      seed([row("run-1", "job_sheet")]);

      const page = await loadAgentHistoryPage({
        agent: "Qualification Agent",
        page: 1,
        limit: 25,
        access: {},
        // Even an authorizer that allows everything cannot rescue an unmapped subject_type:
        // decideAgentSubjects refuses it before rows.allow is ever called.
        rows: allowAllRows(),
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
        access: {},
        rows: allowAllRows(),
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
        access: {},
        rows: allowAllRows(),
      });

      // `rows.allow` is a stub here, not a real query — it costs nothing against `queryMock`.
      // If this number moves, the page has started issuing an extra `query()` call of its own.
      expect(queryMock).toHaveBeenCalledTimes(3);
    });

    it("calls rows.allow once for twenty rows of the same subject type, not once per row", async () => {
      const { loadAgentHistoryPage } = await import("../agent-workspaces");
      const twentyLeadRuns = Array.from({ length: 20 }, (_, index) =>
        row(
          `run-${index}`,
          "lead",
          `00000000-0000-0000-0000-0000000000${String(index).padStart(2, "0")}`,
        ),
      );
      seed(twentyLeadRuns);
      const rows = allowAllRows();

      await loadAgentHistoryPage({
        agent: "Qualification Agent",
        page: 1,
        limit: 25,
        access: {},
        rows,
      });

      expect(rows.allow).toHaveBeenCalledTimes(1);
    });

    it("calls rows.allow once per distinct subject type on a page mixing two types", async () => {
      const { loadAgentHistoryPage } = await import("../agent-workspaces");
      seed([
        row("run-lead-1", "lead", "00000000-0000-0000-0000-000000000021"),
        row("run-lead-2", "lead", "00000000-0000-0000-0000-000000000022"),
        row("run-lead-3", "lead", "00000000-0000-0000-0000-000000000023"),
        row("run-account-1", "account", "00000000-0000-0000-0000-000000000024"),
        row("run-account-2", "account", "00000000-0000-0000-0000-000000000025"),
      ]);
      const rows = allowAllRows();

      await loadAgentHistoryPage({
        agent: "Qualification Agent",
        page: 1,
        limit: 25,
        access: {},
        rows,
      });

      expect(rows.allow).toHaveBeenCalledTimes(2);
    });
  });

  describe("loadAgentDirectoryRead redaction", () => {
    // Same fields loadAgentHistoryPage's `row` seeds — the two directory lists select the
    // same columns as the history page, minus input_data.
    const recentRow = (
      id: string,
      subjectType: string,
      subjectId = "00000000-0000-0000-0000-000000000002",
    ) => ({
      id,
      agent_name: "Lead Qualification Agent",
      workflow_type: "qualify_lead",
      trigger_type: "manual",
      subject_type: subjectType,
      subject_id: subjectId,
      output_summary: "Qualified",
      status: "completed",
      duration_ms: 1200,
      tokens_used: 900,
      confidence_score: 0.8,
      human_review_required: false,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    });

    const attentionRow = (id: string, subjectType: string, subjectId?: string) => ({
      ...recentRow(id, subjectType, subjectId),
      status: "failed",
      attention_reason: "failed",
      age_minutes: 5,
    });

    const seedDirectory = (
      recentRows: ReturnType<typeof recentRow>[],
      attentionRows: ReturnType<typeof attentionRow>[],
    ) => {
      queryMock
        .mockResolvedValueOnce([]) // aggregateRows
        .mockResolvedValueOnce([]) // hourlyRows
        .mockResolvedValueOnce(recentRows)
        .mockResolvedValueOnce(attentionRows);
    };

    it("keeps output_summary, subject_id and subject_type on a recentRuns row the actor may see", async () => {
      const { loadAgentDirectoryRead } = await import("../agent-workspaces");
      seedDirectory([recentRow("run-1", "lead")], []);

      const result = await loadAgentDirectoryRead(
        {},
        stubRows({ "lead:00000000-0000-0000-0000-000000000002": true }),
      );

      expect(result.recentRuns[0].subject_restricted).toBe(false);
      expect(result.recentRuns[0].output_summary).toBe("Qualified");
      expect(result.recentRuns[0].subject_id).toBe("00000000-0000-0000-0000-000000000002");
      expect(result.recentRuns[0].subject_type).toBe("lead");
    });

    it("nulls output_summary, subject_id and subject_type on a recentRuns row the actor may not see", async () => {
      const { loadAgentDirectoryRead } = await import("../agent-workspaces");
      seedDirectory([recentRow("run-1", "lead")], []);

      const result = await loadAgentDirectoryRead({}, stubRows());

      expect(result.recentRuns[0].subject_restricted).toBe(true);
      expect(result.recentRuns[0].output_summary).toBeNull();
      expect(result.recentRuns[0].subject_id).toBeNull();
      expect(result.recentRuns[0].subject_type).toBeNull();
    });

    it("redacts attentionRuns on the same per-subject check", async () => {
      const { loadAgentDirectoryRead } = await import("../agent-workspaces");
      seedDirectory([], [attentionRow("run-attn", "account")]);

      const result = await loadAgentDirectoryRead({}, stubRows());

      expect(result.attentionRuns[0].subject_restricted).toBe(true);
      expect(result.attentionRuns[0].output_summary).toBeNull();
      expect(result.attentionRuns[0].subject_id).toBeNull();
      expect(result.attentionRuns[0].subject_type).toBeNull();
      // attention_reason and age_minutes are not content — nothing gates them.
      expect(result.attentionRuns[0].attention_reason).toBe("failed");
    });

    it("keeps output_summary, subject_id and subject_type on an attentionRuns row the actor may see", async () => {
      const { loadAgentDirectoryRead } = await import("../agent-workspaces");
      seedDirectory([], [attentionRow("run-attn", "account")]);

      const result = await loadAgentDirectoryRead(
        {},
        stubRows({ "account:00000000-0000-0000-0000-000000000002": true }),
      );

      expect(result.attentionRuns[0].subject_restricted).toBe(false);
      expect(result.attentionRuns[0].output_summary).toBe("Qualified");
      expect(result.attentionRuns[0].subject_id).toBe("00000000-0000-0000-0000-000000000002");
      expect(result.attentionRuns[0].subject_type).toBe("account");
    });

    it("redacts per row, not per response", async () => {
      const { loadAgentDirectoryRead } = await import("../agent-workspaces");
      seedDirectory([recentRow("run-lead", "lead"), recentRow("run-account", "account")], []);

      const result = await loadAgentDirectoryRead(
        {},
        stubRows({
          "lead:00000000-0000-0000-0000-000000000002": true,
          "account:00000000-0000-0000-0000-000000000002": false,
        }),
      );

      expect(result.recentRuns[0].subject_restricted).toBe(false);
      expect(result.recentRuns[0].output_summary).toBe("Qualified");
      expect(result.recentRuns[1].subject_restricted).toBe(true);
      expect(result.recentRuns[1].output_summary).toBeNull();
      expect(result.recentRuns[1].subject_id).toBeNull();
      expect(result.recentRuns[1].subject_type).toBeNull();
    });

    it("redacts a denied subject's row without redacting a sibling row of the same subject type", async () => {
      // The load-bearing case for this read: two rows of the same subject_type with different
      // subject_ids and different verdicts — the shape a `deny` override scoped to one record
      // produces, and the shape a capability-level access map could never distinguish.
      const { loadAgentDirectoryRead } = await import("../agent-workspaces");
      seedDirectory(
        [
          recentRow("run-allowed", "lead", "00000000-0000-0000-0000-000000000031"),
          recentRow("run-denied", "lead", "00000000-0000-0000-0000-000000000032"),
        ],
        [],
      );

      const result = await loadAgentDirectoryRead(
        {},
        stubRows({
          "lead:00000000-0000-0000-0000-000000000031": true,
          "lead:00000000-0000-0000-0000-000000000032": false,
        }),
      );

      expect(result.recentRuns[0].subject_restricted).toBe(false);
      expect(result.recentRuns[0].subject_id).toBe("00000000-0000-0000-0000-000000000031");
      expect(result.recentRuns[1].subject_restricted).toBe(true);
      expect(result.recentRuns[1].subject_id).toBeNull();
      expect(result.recentRuns[1].output_summary).toBeNull();
    });

    it("still issues exactly four queries", async () => {
      // `rows.allow` is a stub here, not a real query — it costs nothing against `queryMock`.
      // If this number moves, the directory read has started issuing an extra `query()` call.
      const { loadAgentDirectoryRead } = await import("../agent-workspaces");
      seedDirectory([recentRow("run-1", "lead")], [attentionRow("run-2", "lead")]);

      await loadAgentDirectoryRead({}, allowAllRows());

      expect(queryMock).toHaveBeenCalledTimes(4);
    });

    it("calls rows.allow once per distinct subject type across recentRuns and attentionRuns combined", async () => {
      // recentRuns and attentionRuns are decided together, in one call before either list is
      // mapped — not once per list and not once per row — because a run can appear in both
      // (a stuck run is also recent), and deciding them separately would ask twice about the
      // same subject.
      const { loadAgentDirectoryRead } = await import("../agent-workspaces");
      seedDirectory(
        Array.from({ length: 20 }, (_, index) =>
          recentRow(
            `run-recent-${index}`,
            "lead",
            `00000000-0000-0000-0000-0000000000${String(index).padStart(2, "0")}`,
          ),
        ),
        [attentionRow("run-attn", "account", "00000000-0000-0000-0000-000000000099")],
      );
      const rows = allowAllRows();

      await loadAgentDirectoryRead({}, rows);

      expect(rows.allow).toHaveBeenCalledTimes(2);
    });
  });

  describe("loadAiReviewRead redaction", () => {
    // Same fields loadAgentDirectoryRead's recentRow seeds — humanReviewRuns is selected with
    // the same columns as the two directory lists.
    const runRow = (
      id: string,
      subjectType: string,
      subjectId = "00000000-0000-0000-0000-000000000003",
    ) => ({
      id,
      agent_name: "Reply Draft Agent",
      workflow_type: "draft_reply",
      trigger_type: "webhook",
      subject_type: subjectType,
      subject_id: subjectId,
      output_summary: "Drafted a reply",
      status: "waiting_approval",
      duration_ms: 800,
      tokens_used: 500,
      confidence_score: 0.7,
      human_review_required: true,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    });

    const seedAiReview = (approvalRows: unknown[], runRows: ReturnType<typeof runRow>[]) => {
      queryMock
        .mockResolvedValueOnce(approvalRows) // approvals
        .mockResolvedValueOnce(runRows); // humanReviewRuns
    };

    it("keeps output_summary, subject_id and subject_type on a humanReviewRuns row the actor may see", async () => {
      const { loadAiReviewRead } = await import("../agent-workspaces");
      seedAiReview([], [runRow("run-1", "lead")]);

      const result = await loadAiReviewRead(
        {},
        stubRows({ "lead:00000000-0000-0000-0000-000000000003": true }),
      );

      expect(result.humanReviewRuns[0].subject_restricted).toBe(false);
      expect(result.humanReviewRuns[0].output_summary).toBe("Drafted a reply");
      expect(result.humanReviewRuns[0].subject_id).toBe("00000000-0000-0000-0000-000000000003");
      expect(result.humanReviewRuns[0].subject_type).toBe("lead");
    });

    it("nulls output_summary, subject_id and subject_type on a humanReviewRuns row the actor may not see", async () => {
      const { loadAiReviewRead } = await import("../agent-workspaces");
      seedAiReview([], [runRow("run-1", "lead")]);

      const result = await loadAiReviewRead({}, stubRows());

      expect(result.humanReviewRuns[0].subject_restricted).toBe(true);
      expect(result.humanReviewRuns[0].output_summary).toBeNull();
      expect(result.humanReviewRuns[0].subject_id).toBeNull();
      expect(result.humanReviewRuns[0].subject_type).toBeNull();
    });

    it("redacts per row, not per response", async () => {
      const { loadAiReviewRead } = await import("../agent-workspaces");
      seedAiReview([], [runRow("run-lead", "lead"), runRow("run-account", "account")]);

      const result = await loadAiReviewRead(
        {},
        stubRows({
          "lead:00000000-0000-0000-0000-000000000003": true,
          "account:00000000-0000-0000-0000-000000000003": false,
        }),
      );

      expect(result.humanReviewRuns[0].subject_restricted).toBe(false);
      expect(result.humanReviewRuns[0].output_summary).toBe("Drafted a reply");
      expect(result.humanReviewRuns[1].subject_restricted).toBe(true);
      expect(result.humanReviewRuns[1].output_summary).toBeNull();
      expect(result.humanReviewRuns[1].subject_id).toBeNull();
      expect(result.humanReviewRuns[1].subject_type).toBeNull();
    });

    it("redacts a denied subject's run without redacting a sibling run of the same subject type", async () => {
      // Same load-bearing shape as the other two reads: two humanReviewRuns of the same
      // subject_type with different subject_ids and different verdicts.
      const { loadAiReviewRead } = await import("../agent-workspaces");
      seedAiReview(
        [],
        [
          runRow("run-allowed", "lead", "00000000-0000-0000-0000-000000000041"),
          runRow("run-denied", "lead", "00000000-0000-0000-0000-000000000042"),
        ],
      );

      const result = await loadAiReviewRead(
        {},
        stubRows({
          "lead:00000000-0000-0000-0000-000000000041": true,
          "lead:00000000-0000-0000-0000-000000000042": false,
        }),
      );

      expect(result.humanReviewRuns[0].subject_restricted).toBe(false);
      expect(result.humanReviewRuns[0].subject_id).toBe("00000000-0000-0000-0000-000000000041");
      expect(result.humanReviewRuns[1].subject_restricted).toBe(true);
      expect(result.humanReviewRuns[1].subject_id).toBeNull();
      expect(result.humanReviewRuns[1].output_summary).toBeNull();
    });

    it("still issues exactly two queries", async () => {
      // `rows.allow` is a stub here, not a real query — it costs nothing against `queryMock`.
      // If this number moves, the read has started issuing an extra `query()` call.
      const { loadAiReviewRead } = await import("../agent-workspaces");
      seedAiReview([], [runRow("run-1", "lead")]);

      await loadAiReviewRead({}, allowAllRows());

      expect(queryMock).toHaveBeenCalledTimes(2);
    });

    const approvalRow = (
      id: string,
      subjectType: string | null,
      subjectId = "00000000-0000-0000-0000-000000000004",
    ) => ({
      id,
      agent_run_id: subjectType === null ? null : "00000000-0000-0000-0000-0000000000aa",
      approval_type: "message_send",
      requested_by: "Reply Draft Agent",
      assigned_to: "user-1",
      status: "pending",
      context_data: { lead_id: "lead-1", draft_message: "Hello Acme, about your enquiry…" },
      context_summary: "Drafted a reply for review.",
      reviewer_notes: "Checked the tone.",
      decided_at: null,
      created_at: "2026-09-01T00:00:00.000Z",
      subject_type: subjectType,
      // A left join means an orphaned approval (its run deleted) carries no subject_id either
      // — matching the real SQL, where subject_id comes from the same joined row as
      // subject_type and is null on exactly the same miss.
      subject_id: subjectType === null ? null : subjectId,
    });

    it("keeps approval content when the actor holds the run subject's capability", async () => {
      const { loadAiReviewRead } = await import("../agent-workspaces");
      queryMock.mockResolvedValueOnce([approvalRow("ap-1", "lead")]).mockResolvedValueOnce([]);

      const result = await loadAiReviewRead(
        {},
        stubRows({ "lead:00000000-0000-0000-0000-000000000004": true }),
      );

      expect(result.approvals[0].subject_restricted).toBe(false);
      expect(result.approvals[0].context_data).toEqual({
        lead_id: "lead-1",
        draft_message: "Hello Acme, about your enquiry…",
      });
      expect(result.approvals[0].context_summary).toBe("Drafted a reply for review.");
      expect(result.approvals[0].reviewer_notes).toBe("Checked the tone.");
    });

    it("nulls the drafted message when the actor lacks that capability", async () => {
      const { loadAiReviewRead } = await import("../agent-workspaces");
      queryMock.mockResolvedValueOnce([approvalRow("ap-1", "lead")]).mockResolvedValueOnce([]);

      const result = await loadAiReviewRead({}, stubRows());

      expect(result.approvals[0].subject_restricted).toBe(true);
      expect(result.approvals[0].context_data).toBeNull();
    });

    it("nulls the approval's own summary when restricted", async () => {
      const { loadAiReviewRead } = await import("../agent-workspaces");
      queryMock.mockResolvedValueOnce([approvalRow("ap-1", "lead")]).mockResolvedValueOnce([]);

      const result = await loadAiReviewRead({}, stubRows());

      expect(result.approvals[0].context_summary).toBeNull();
    });

    it("nulls the reviewer notes when restricted", async () => {
      const { loadAiReviewRead } = await import("../agent-workspaces");
      queryMock.mockResolvedValueOnce([approvalRow("ap-1", "lead")]).mockResolvedValueOnce([]);

      const result = await loadAiReviewRead({}, stubRows());

      expect(result.approvals[0].reviewer_notes).toBeNull();
    });

    it("redacts an orphaned approval but keeps it in the queue", async () => {
      const { loadAiReviewRead } = await import("../agent-workspaces");
      queryMock.mockResolvedValueOnce([approvalRow("ap-orphan", null)]).mockResolvedValueOnce([]);

      // agent_run_id is `on delete set null`, so deleting a run orphans its approval. It has
      // no subject, so it redacts — but it must still appear, or a misassigned item silently
      // vanishes from the queue instead of being seen and reassigned.
      //
      // This covers the in-memory path only: a null subject_type (and the null subject_id that
      // comes with it) has no owner to resolve, so the approval redacts even against an
      // authorizer that allows everything. It does NOT prove the query keeps orphans — `query`
      // is mocked here, so the seeded row comes back whatever the SQL says. Switching
      // `left join` to `inner join` leaves this test green; the join type is guarded by the SQL
      // assertion in "selects explicit columns and joins the run, in two queries" instead.
      const result = await loadAiReviewRead({}, allowAllRows());

      expect(result.approvals).toHaveLength(1);
      expect(result.approvals[0].id).toBe("ap-orphan");
      expect(result.approvals[0].subject_restricted).toBe(true);
      expect(result.approvals[0].context_data).toBeNull();
    });

    it("redacts per approval, not per response", async () => {
      const { loadAiReviewRead } = await import("../agent-workspaces");
      queryMock
        .mockResolvedValueOnce([approvalRow("ap-lead", "lead"), approvalRow("ap-acct", "account")])
        .mockResolvedValueOnce([]);

      const result = await loadAiReviewRead(
        {},
        stubRows({
          "lead:00000000-0000-0000-0000-000000000004": true,
          "account:00000000-0000-0000-0000-000000000004": false,
        }),
      );

      expect(result.approvals[0].subject_restricted).toBe(false);
      expect(result.approvals[1].subject_restricted).toBe(true);
      expect(result.approvals[1].context_data).toBeNull();
    });

    it("redacts a denied approval without redacting a sibling approval of the same subject type", async () => {
      // The approvals-specific case of the load-bearing test: two approvals whose runs are both
      // about a lead, different leads, different verdicts. This is exactly what selecting
      // `subject_id` in Step 3 exists to make possible — without it every approval of one
      // subject_type would live or die together, same as before this branch.
      const { loadAiReviewRead } = await import("../agent-workspaces");
      queryMock
        .mockResolvedValueOnce([
          approvalRow("ap-allowed", "lead", "00000000-0000-0000-0000-000000000051"),
          approvalRow("ap-denied", "lead", "00000000-0000-0000-0000-000000000052"),
        ])
        .mockResolvedValueOnce([]);

      const result = await loadAiReviewRead(
        {},
        stubRows({
          "lead:00000000-0000-0000-0000-000000000051": true,
          "lead:00000000-0000-0000-0000-000000000052": false,
        }),
      );

      expect(result.approvals[0].subject_restricted).toBe(false);
      expect(result.approvals[0].context_data).not.toBeNull();
      expect(result.approvals[1].subject_restricted).toBe(true);
      expect(result.approvals[1].context_data).toBeNull();
    });

    it("never ships the joined subject_type", async () => {
      const { loadAiReviewRead } = await import("../agent-workspaces");
      queryMock.mockResolvedValueOnce([approvalRow("ap-1", "lead")]).mockResolvedValueOnce([]);

      const result = await loadAiReviewRead(
        {},
        stubRows({ "lead:00000000-0000-0000-0000-000000000004": true }),
      );

      // The join exists to decide the redaction, not to widen the payload.
      expect(result.approvals[0]).not.toHaveProperty("subject_type");
    });

    it("never ships the joined subject_id", async () => {
      // Mirrors "never ships the joined subject_type" above. subject_id is now selected in SQL
      // (Step 3: row-level ownership needs it to resolve *which* lead an approval concerns),
      // but it must be stripped before the row reaches the client — exactly as subject_type
      // already is — or this undoes PR #76, which excluded the id from this query specifically
      // so it could never be shipped to a reader who was just denied the record it names.
      const { loadAiReviewRead } = await import("../agent-workspaces");
      queryMock.mockResolvedValueOnce([approvalRow("ap-1", "lead")]).mockResolvedValueOnce([]);

      const result = await loadAiReviewRead(
        {},
        stubRows({ "lead:00000000-0000-0000-0000-000000000004": true }),
      );

      expect(result.approvals[0]).not.toHaveProperty("subject_id");
    });

    it("selects explicit columns, subject_id included, and joins the run, in two queries", async () => {
      const { loadAiReviewRead } = await import("../agent-workspaces");
      queryMock.mockResolvedValueOnce([approvalRow("ap-1", "lead")]).mockResolvedValueOnce([]);

      await loadAiReviewRead({}, stubRows({ "lead:00000000-0000-0000-0000-000000000004": true }));

      const sql = sqlText(queryMock.mock.calls[0][0]);
      expect(sql).not.toContain("select *");
      expect(sql).toContain("left join agent_runs");
      expect(sql).not.toContain("inner join");
      // Selected now, deliberately (Step 3) — row-level ownership needs the id to resolve which
      // record an approval concerns. "never ships the joined subject_id" above is what keeps
      // this from reaching the client.
      expect(sql).toContain("r.subject_id");
      expect(queryMock).toHaveBeenCalledTimes(2);
    });
  });
});
