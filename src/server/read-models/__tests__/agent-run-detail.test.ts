import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestAuthorization, RowAuthorizer } from "@/server/auth/authorization.server";
const mocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn() }));
vi.mock("@/server/db/neon.server", () => mocks);
import { loadAgentRunDetail } from "../agent-run-detail";

const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const subjectId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const context = { actor: { profileId: "reader", status: "active" } } as RequestAuthorization;
const run = {
  id: runId,
  agent_name: "Qualification",
  workflow_type: "qualify_lead",
  subject_type: "lead",
  subject_id: subjectId,
  created_by: "creator",
  status: "completed",
  trigger_type: "manual",
  created_at: "2026-11-14T00:00:00.000Z",
  updated_at: "2026-11-14T00:00:01.000Z",
  duration_ms: 1000,
  model_used: null,
  outcome_code: "completed",
  attempt_id: null,
  input_data: "private-input-canary",
  output_data: "private-output-canary",
};
function authorizer(allowed = true): RowAuthorizer {
  const allow: RowAuthorizer["allow"] = async (_cap, _type, ids) =>
    new Map(ids.map((id) => [id, allowed]));
  return { allow: vi.fn(allow) };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryOne.mockResolvedValue({ ...run });
  mocks.query.mockResolvedValue([]);
});

describe("scoped run-detail read", () => {
  it("checks the subject before loading only explicitly projected trace metadata", async () => {
    const rows = authorizer();
    mocks.query.mockImplementation(async () => {
      expect(rows.allow).toHaveBeenCalledWith("leads.view", "lead", [subjectId]);
      return [
        {
          id: "event",
          called_at: "2026-11-14T00:00:01.000123Z",
          tool_name: "qualify_lead",
          source: "n8n_dispatch",
          status: "ok",
          duration_ms: 10,
          error_code: null,
          args_digest: "a".repeat(64),
          args_keys: ["lead_id"],
          input_params: "private-input-canary",
          output_result: "private-output-canary",
          error_message: "private-error-canary",
          target_ids: ["other-subject-canary"],
        },
      ];
    });
    const result = await loadAgentRunDetail({ runId }, context, rows);
    expect(result).toMatchObject({
      available: true,
      actorId: "reader",
      run: { id: runId },
      nextCursor: null,
    });
    for (const secret of [
      "private-input-canary",
      "private-output-canary",
      "private-error-canary",
      "other-subject-canary",
      subjectId,
      "created_by",
    ]) {
      expect(JSON.stringify(result)).not.toContain(secret);
    }
    const sql = mocks.query.mock.calls[0][0] as string;
    expect(sql).not.toMatch(/select\s+\*/i);
    expect(sql).not.toMatch(/input_params|output_result|error_message|target_ids/);
    expect(mocks.query.mock.calls[0][1]).toEqual([runId, 51]);
  });

  it("uses the same data-free result for denied subjects and nonexistent runs", async () => {
    const denied = await loadAgentRunDetail({ runId }, context, authorizer(false));
    mocks.queryOne.mockResolvedValue(null);
    expect(await loadAgentRunDetail({ runId }, context, authorizer())).toEqual(denied);
    expect(denied).toEqual({ available: false, actorId: "reader" });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each(["unknown", "__proto__", "constructor", "note"])(
    "fails closed for an unmapped subject: %s",
    async (subject_type) => {
      mocks.queryOne.mockResolvedValue({ ...run, subject_type });
      const rows = authorizer();
      expect(await loadAgentRunDetail({ runId }, context, rows)).toEqual({
        available: false,
        actorId: "reader",
      });
      expect(rows.allow).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );

  it("maps approval ownership to human_approval, preserving scoped overrides", async () => {
    mocks.queryOne.mockResolvedValue({ ...run, subject_type: "approval" });
    const rows = authorizer(false);
    await loadAgentRunDetail({ runId }, context, rows);
    expect(rows.allow).toHaveBeenCalledWith("approvals.view", "human_approval", [subjectId]);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("keeps Note Tidy runs actor-owned even when another actor can read all CRM subjects", async () => {
    mocks.queryOne.mockResolvedValue({
      ...run,
      workflow_type: "note_tidy",
      subject_type: "note",
      created_by: "creator",
    });
    expect(await loadAgentRunDetail({ runId }, context, authorizer())).toMatchObject({
      available: false,
    });
    expect(mocks.query).not.toHaveBeenCalled();
    mocks.queryOne.mockResolvedValue({
      ...run,
      workflow_type: "note_tidy",
      subject_type: "note",
      created_by: "reader",
    });
    expect(await loadAgentRunDetail({ runId }, context, authorizer())).toMatchObject({
      available: true,
    });
    mocks.queryOne.mockResolvedValue({
      ...run,
      workflow_type: "note_tidy",
      subject_type: "lead",
      created_by: "reader",
    });
    expect(await loadAgentRunDetail({ runId }, context, authorizer())).toMatchObject({
      available: false,
    });
  });

  it("does not query for an inactive actor", async () => {
    await loadAgentRunDetail(
      { runId },
      { ...context, actor: { ...context.actor, status: "suspended" } },
      authorizer(),
    );
    expect(mocks.queryOne).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("bounds each page and preserves microseconds in its keyset cursor", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `event-${i}`,
      called_at: "2026-11-14T00:00:01.000123Z",
    }));
    mocks.query.mockResolvedValue(rows);
    const result = await loadAgentRunDetail({ runId }, context, authorizer());
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.events).toHaveLength(50);
    expect(result.nextCursor).toEqual({ calledAt: rows[49].called_at, id: rows[49].id });
    await loadAgentRunDetail(
      { runId, cursor: { calledAt: rows[49].called_at, id: runId } },
      context,
      authorizer(),
    );
    expect(mocks.query.mock.calls[1][1]).toEqual([runId, rows[49].called_at, runId, 51]);
    expect(mocks.query.mock.calls[1][0]).toContain("(c.called_at,c.id)<($2::timestamptz,$3::uuid)");
  });
});
