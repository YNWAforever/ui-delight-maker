import { describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
import { classifyAgentRun, loadAgentReconciliation } from "../agent-reconciliation";

const row = (changes = {}) => ({
  run_id: "run-1",
  workflow_type: "draft_quote",
  legacy_name: "Quote Agent",
  status: "waiting_approval",
  is_demo: null,
  subject_exists: true,
  approval_statuses: ["pending"],
  human_review_required: true,
  created_by: null,
  outcome_code: null,
  ...changes,
});

describe("agent reconciliation", () => {
  it("distinguishes_escalated_from_missing_approval", () => {
    expect(classifyAgentRun(row({ approval_statuses: ["escalated"] })).anomalyCodes).toEqual([
      "escalated",
    ]);
    expect(classifyAgentRun(row({ approval_statuses: [] })).anomalyCodes).toEqual([
      "missing_approval",
    ]);
  });
  it("keeps_demo_and_link_anomalies_independent", () => {
    expect(classifyAgentRun(row({ is_demo: true, subject_exists: false })).anomalyCodes).toEqual([
      "demo",
      "missing_subject",
    ]);
  });
  it("uses workflow identity while retaining the historical label", () => {
    expect(classifyAgentRun(row())).toMatchObject({
      workflowType: "draft_quote",
      legacyName: "Quote Agent",
      anomalyCodes: ["valid"],
    });
  });
  it("does not infer demo from a name or guess an owner", () => {
    expect(classifyAgentRun(row({ legacy_name: "demo-example" }))).toMatchObject({
      isDemo: null,
      suggestedOwner: null,
      anomalyCodes: ["valid"],
    });
  });
  it("keeps unknown identity and subject provenance explicit", () => {
    expect(
      classifyAgentRun(row({ workflow_type: "retired", subject_exists: null })).anomalyCodes,
    ).toEqual(["unknown"]);
  });
  it.each([
    { status: "completed", approval_statuses: ["pending"] },
    { status: "failed", approval_statuses: ["escalated"] },
    { status: "waiting_approval", approval_statuses: ["approved"] },
    { approval_statuses: ["pending", "escalated"] },
  ])("reports terminal/link mismatch independently: %o", (changes) => {
    expect(classifyAgentRun(row(changes)).anomalyCodes).toContain("terminal_mismatch");
  });
  it("does_not_write_during_reconciliation", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row()] });
    const result = await loadAgentReconciliation({ query } as Queryable);
    expect(result[0].runId).toBe("run-1");
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0][0]);
    expect(sql.trim()).toMatch(/^select/i);
    expect(sql).not.toMatch(/\b(insert|update|delete|alter|truncate|create|drop)\b/i);
    expect(sql).toMatch(/input_data\s*->\s*'demo'/);
    expect(sql).not.toMatch(/agent_name\s+(?:like|ilike)/i);
    expect(Object.keys(result[0])).toEqual([
      "runId",
      "workflowType",
      "legacyName",
      "isDemo",
      "subjectExists",
      "approvalStatus",
      "anomalyCodes",
      "suggestedOwner",
    ]);
  });
});
