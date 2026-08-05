import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deciding an approval has to release the agent run waiting on it.
 *
 * `agent_runs_active_idx` (001_clientops_runtime.sql) is a partial unique index over
 * `(subject_type, subject_id, workflow_type) where status in ('running','waiting_approval')`.
 * A run parked in `waiting_approval` after its approval was decided therefore blocks every
 * future run of that workflow for that subject — permanently, and for rejections as much as
 * approvals. Nothing released it, so approving a renewal-risk review killed renewal-risk
 * scoring for that engagement for good.
 */
const mocks = vi.hoisted(() => {
  const client = { query: vi.fn() };
  return {
    client,
    transactionMock: vi.fn(async (work: (db: typeof client) => Promise<unknown>) => work(client)),
    createNotificationMock: vi.fn(),
    listApproverProfileIdsMock: vi.fn(),
  };
});

vi.mock("@/server/db/neon.server", () => ({
  transaction: mocks.transactionMock,
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/server/repositories/notifications", () => ({
  createNotification: mocks.createNotificationMock,
  listApproverProfileIds: mocks.listApproverProfileIdsMock,
}));

import { decideApproval } from "@/server/repositories/approvals";

function approvalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "approval-1",
    agent_run_id: "run-1",
    approval_type: "cs_risk_review",
    status: "pending",
    ...overrides,
  };
}

/** The `update agent_runs` statement the decision emitted, if any. */
function agentRunUpdate() {
  return mocks.client.query.mock.calls.find(([text]) =>
    String(text).replace(/\s+/g, " ").includes("update agent_runs"),
  );
}

describe("decideApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.query.mockImplementation(async (text: string) => {
      if (String(text).includes("update human_approvals")) return { rows: [approvalRow()] };
      return { rows: [] };
    });
  });

  it.each(["approved", "rejected"] as const)(
    "releases the waiting agent run when an approval is %s",
    async (decision) => {
      await decideApproval({ id: "approval-1", decision, notes: "reviewed", actorId: "user-1" });

      const update = agentRunUpdate();
      expect(update, `expected the ${decision} decision to release the run`).toBeDefined();
      const [text, values] = update!;
      const sql = String(text).replace(/\s+/g, " ");

      expect(sql).toMatch(/set status = 'completed'/);
      expect(sql).toMatch(/human_review_required = false/);
      // Scoped to a still-waiting run, so replaying a decision cannot overwrite a run that
      // already finished or failed on its own.
      expect(sql).toMatch(/where id = \$1 and status = 'waiting_approval'/);
      expect(values).toEqual(["run-1"]);
    },
  );

  it("keeps the run parked when the decision is an escalation", async () => {
    // Escalation defers the decision rather than making one, so the hold has to stay.
    await decideApproval({
      id: "approval-1",
      decision: "escalated",
      notes: "needs finance",
      actorId: "user-1",
    });

    expect(agentRunUpdate()).toBeUndefined();
  });

  it("does nothing to agent runs for an approval that has none", async () => {
    mocks.client.query.mockImplementation(async (text: string) => {
      if (String(text).includes("update human_approvals")) {
        return { rows: [approvalRow({ agent_run_id: null })] };
      }
      return { rows: [] };
    });

    await decideApproval({ id: "approval-1", decision: "approved", actorId: "user-1" });

    expect(agentRunUpdate()).toBeUndefined();
  });

  it("records the decision in the activity log inside the same transaction", async () => {
    await decideApproval({
      id: "approval-1",
      decision: "approved",
      notes: "looks right",
      actorId: "user-1",
    });

    expect(mocks.transactionMock).toHaveBeenCalledTimes(1);
    const auditCall = mocks.client.query.mock.calls.find(([text]) =>
      String(text).includes("insert into activity_logs"),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![1]).toEqual(["user-1", "approved approval", "approval-1"]);
  });

  it("fails loudly when the approval does not exist", async () => {
    mocks.client.query.mockResolvedValue({ rows: [] });

    await expect(
      decideApproval({ id: "missing", decision: "approved", actorId: "user-1" }),
    ).rejects.toThrow("Approval not found");
  });
});
