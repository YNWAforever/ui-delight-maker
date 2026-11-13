import { beforeEach, describe, expect, it, vi } from "vitest";
import { validQualification } from "@/lib/workflows/__tests__/commercial-fixtures";

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  getRun: vi.fn(),
  updateRun: vi.fn().mockResolvedValue(undefined),
  updateLead: vi.fn().mockResolvedValue(undefined),
  log: vi.fn().mockResolvedValue(undefined),
  trace: vi.fn(),
}));
vi.mock("@/server/db/neon.server", () => ({
  transaction: async (work: (db: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
    try {
      const result = await work({ query: vi.fn().mockResolvedValue({ rows: [] }) });
      mocks.events.push("commit");
      return result;
    } catch (error) {
      mocks.events.push("rollback");
      throw error;
    }
  },
}));
vi.mock("@/server/repositories/agent-runs", () => ({
  getAgentRunForUpdate: mocks.getRun,
  updateAgentRunResult: mocks.updateRun,
}));
vi.mock("@/server/repositories/leads", () => ({ updateLead: mocks.updateLead }));
vi.mock("@/server/repositories/activity-logs", () => ({ createActivityLog: mocks.log }));
vi.mock("@/server/repositories/agent-tool-calls", () => ({ recordToolCallTrace: mocks.trace }));
import { recordInvalidWriteback, writeQualificationResult } from "../writebacks";

const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const leadId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const attemptId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const payload = {
  agent_run_id: runId,
  lead_id: leadId,
  attempt_id: attemptId,
  qualification_data: validQualification,
  lead_score: 80,
  output_summary: "private-client-summary-canary",
  confidence_score: 0.8,
};
const run = {
  id: runId,
  workflow_type: "qualify_lead",
  subject_type: "lead",
  subject_id: leadId,
  attempt_id: attemptId,
  status: "running",
  agent_name: "Qualification",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events.length = 0;
  mocks.getRun.mockResolvedValue({ ...run });
  mocks.updateLead.mockResolvedValue(undefined);
  mocks.trace.mockImplementation(async () => {
    mocks.events.push("trace");
    return true;
  });
});

describe("bound n8n callback attempt evidence", () => {
  it("records only server-bound metadata after a successful commit", async () => {
    await writeQualificationResult(payload);
    expect(mocks.events).toEqual(["commit", "trace"]);
    expect(mocks.trace).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "n8n_writeback",
        agentRunId: runId,
        toolName: "qualify_lead",
        status: "ok",
        errorCode: null,
        args: {
          workflow_type: "qualify_lead",
          agent_run_id: runId,
          lead_id: leadId,
          attempt_id: attemptId,
        },
      }),
    );
    expect(JSON.stringify(mocks.trace.mock.calls)).not.toContain(payload.output_summary);
    expect(mocks.updateLead).toHaveBeenCalledTimes(1);
  });

  it("traces a replay delivery while preserving the business no-op", async () => {
    mocks.getRun.mockResolvedValue({ ...run, status: "completed" });
    await writeQualificationResult(payload);
    expect(mocks.updateLead).not.toHaveBeenCalled();
    expect(mocks.trace).toHaveBeenCalledTimes(1);
    expect(mocks.events).toEqual(["commit", "trace"]);
  });

  it.each([
    { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
    { subject_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
    { workflow_type: "draft_reply" },
    { attempt_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
  ])("refuses to attribute evidence when callback binding is wrong: %j", async (change) => {
    mocks.getRun.mockResolvedValue({ ...run, ...change });
    await expect(writeQualificationResult(payload)).rejects.toThrow();
    expect(mocks.trace).not.toHaveBeenCalled();
    expect(mocks.updateLead).not.toHaveBeenCalled();
  });

  it("does not attach evidence to a nonexistent run", async () => {
    mocks.getRun.mockResolvedValue(null);
    await expect(writeQualificationResult(payload)).rejects.toThrow("Agent run not found");
    expect(mocks.trace).not.toHaveBeenCalled();
  });

  it("traces an invalid-output receipt after commit while retaining the rejection", async () => {
    await recordInvalidWriteback(
      { ...payload, invalid_output_code: "schema_invalid" },
      "qualify_lead",
    );
    expect(mocks.updateRun).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({
        status: "failed",
        outcome_code: "invalid_output",
      }),
      expect.anything(),
    );
    expect(mocks.events).toEqual(["commit", "trace"]);
    expect(mocks.trace).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", errorCode: "invalid_output" }),
    );
  });

  it("retains rollback failure evidence without logging provider or database messages", async () => {
    const failure = new Error("private-write-failure-canary");
    mocks.updateLead.mockRejectedValue(failure);
    await expect(writeQualificationResult(payload)).rejects.toBe(failure);
    expect(mocks.events).toEqual(["rollback", "trace"]);
    expect(mocks.trace).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", errorCode: "callback_failed" }),
    );
    expect(JSON.stringify(mocks.trace.mock.calls)).not.toContain(failure.message);
  });

  it("does not turn a committed callback into a retry if tracing throws", async () => {
    mocks.trace.mockRejectedValue(new Error("trace failure"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(writeQualificationResult(payload)).resolves.toBeUndefined();
    expect(mocks.updateLead).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
