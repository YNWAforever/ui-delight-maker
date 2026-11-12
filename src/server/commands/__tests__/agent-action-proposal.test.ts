import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentActionProposalInput } from "@/lib/agent-actions";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { Queryable } from "@/server/db/neon.server";
import type { HumanApproval } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  requireCapability: vi.fn(),
  createApproval: vi.fn(),
  createActivityLog: vi.fn(),
  claimCommandReceipt: vi.fn(),
  completeCommandReceipt: vi.fn(),
  recordManualMessageSentCommand: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  transaction: mocks.transaction,
  query: vi.fn(),
  queryOne: vi.fn(),
}));
vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: mocks.requireCapability,
}));
vi.mock("@/server/repositories/approvals", () => ({
  createApproval: mocks.createApproval,
}));
vi.mock("@/server/repositories/activity-logs", () => ({
  createActivityLog: mocks.createActivityLog,
}));
vi.mock("@/server/commands/receipts.server", () => ({
  claimCommandReceipt: mocks.claimCommandReceipt,
  completeCommandReceipt: mocks.completeCommandReceipt,
}));
vi.mock("@/server/commands/message-handoff.server", () => ({
  recordManualMessageSentCommand: mocks.recordManualMessageSentCommand,
}));

import { proposeAgentActionCommand } from "@/server/commands/agent-action-proposal.server";
import { applyAgentActionDecisionInTransaction } from "@/server/commands/agent-action-execution.server";
import { parseAgentActionProposalPayload } from "@/server/repositories/agent-action-proposals";

const tokenId = "11111111-1111-4111-8111-111111111111";
const targetApprovalId = "22222222-2222-4222-8222-222222222222";
const proposalId = "33333333-3333-4333-8333-333333333333";
const idempotencyKey = "agent-key-0001";

function context(
  profileId: string,
  role: RequestAuthorization["actor"]["role"] = "sales",
): RequestAuthorization {
  return {
    session: { profile: { id: profileId } } as RequestAuthorization["session"],
    actor: {
      profileId,
      role,
      status: "active",
      managedDepartmentIds: [],
      managedTeamIds: [],
      directReportIds: [],
    },
    overrides: [],
    now: new Date(),
  };
}

const proposer = context("proposer-1");
const approver = context("approver-1", "admin");

function approvalRow(overrides: Partial<HumanApproval> = {}): HumanApproval {
  return {
    id: proposalId,
    agent_run_id: null,
    approval_type: "agent_action",
    requested_by: "proposer-1",
    requested_by_profile_id: "proposer-1",
    assigned_to: null,
    status: "pending",
    row_version: 0,
    superseded_by: null,
    context_data: proposalPayload(),
    context_summary: "Record the manual send reference",
    reviewer_notes: null,
    decided_at: null,
    created_at: "2026-11-12T00:00:00.000Z",
    ...overrides,
  };
}

function proposalPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "record_manual_message_sent",
    target_approval_id: targetApprovalId,
    reference: "WA-12345",
    proposal_key: `${tokenId}:${idempotencyKey}`,
    proposed_by_profile_id: "proposer-1",
    proposed_by_token_id: tokenId,
    token_name: "Ops token",
    ...overrides,
  };
}

function targetApproval(): HumanApproval {
  return {
    ...approvalRow(),
    id: targetApprovalId,
    approval_type: "message_send",
    status: "approved",
    requested_by: "Reply Draft Agent",
    requested_by_profile_id: null,
  };
}

type FakeRows = {
  target?: HumanApproval | null;
  handoff?: { handoff_status: string; sent_reference?: string | null } | null;
  open?: HumanApproval | null;
};

function fakeDb(rows: FakeRows = {}): Queryable {
  let current = rows;
  const db = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("from profiles p")) return { rows: [{ manager_profile_id: "manager-1" }] };
      if (sql.includes("from human_approvals where id=$1 for update")) {
        return { rows: current.target ? [current.target] : [] };
      }
      if (sql.includes("from approval_message_handoffs")) {
        return { rows: current.handoff ? [current.handoff] : [] };
      }
      if (sql.includes("context_data->>'proposal_key'")) {
        return { rows: current.open ? [current.open] : [] };
      }
      return { rows: [] };
    }),
    setRows(next: FakeRows) {
      current = next;
    },
  };
  return db as unknown as Queryable;
}

function defaultRows(): FakeRows {
  return {
    target: targetApproval(),
    handoff: { handoff_status: "awaiting_manual_send", sent_reference: null },
    open: null,
  };
}

function validInput(overrides: Partial<AgentActionProposalInput> = {}): AgentActionProposalInput {
  return {
    action: "record_manual_message_sent",
    targetApprovalId,
    reference: "WA-12345",
    idempotencyKey,
    tokenId,
    tokenName: "Ops token",
    ...overrides,
  };
}

async function expectAdminError(promise: Promise<unknown>, code: string, message?: string) {
  const error = await promise.then(
    () => {
      throw new Error("Expected the command to reject");
    },
    (rejection: unknown) => rejection,
  );
  expect(error).toMatchObject({ name: "AdminError", code });
  if (message) expect((error as Error).message).toBe(message);
}

let db: Queryable;

beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb(defaultRows());
  mocks.transaction.mockImplementation(async (work: (inner: Queryable) => Promise<unknown>) =>
    work(db),
  );
  mocks.requireCapability.mockResolvedValue({});
  mocks.claimCommandReceipt.mockResolvedValue({ kind: "new", id: "receipt-1" });
  mocks.createApproval.mockImplementation(
    async (input: {
      requested_by: string | null;
      requested_by_profile_id?: string | null;
      assigned_to?: string | null;
      context_data: unknown;
      context_summary?: string | null;
    }) => ({
      ...approvalRow(),
      requested_by: input.requested_by,
      requested_by_profile_id: input.requested_by_profile_id ?? null,
      assigned_to: input.assigned_to ?? null,
      context_data: input.context_data,
      context_summary: input.context_summary ?? null,
    }),
  );
  mocks.recordManualMessageSentCommand.mockResolvedValue({
    approval_id: targetApprovalId,
    handoff_status: "manual_send_recorded",
    sent_reference: "WA-12345",
    recorded_by: "approver-1",
    recorded_at: "2026-11-12T00:00:00.000Z",
  });
});

describe("proposeAgentActionCommand", () => {
  it("records a pending approval with the proposer, manager assignment and audit row", async () => {
    const result = await proposeAgentActionCommand(proposer, validInput());

    expect(result).toEqual({
      status: "pending_approval",
      approvalId: proposalId,
      targetApprovalId,
      requiresApproval: true,
      message: expect.any(String),
    });
    expect(mocks.requireCapability).toHaveBeenCalledWith(
      "approvals.view",
      { resourceType: "human_approval", resourceId: targetApprovalId },
      proposer,
    );
    expect(mocks.createApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        approval_type: "agent_action",
        requested_by: "proposer-1",
        requested_by_profile_id: "proposer-1",
        assigned_to: "manager-1",
        context_data: expect.objectContaining({
          action: "record_manual_message_sent",
          target_approval_id: targetApprovalId,
          reference: "WA-12345",
          proposal_key: `${tokenId}:${idempotencyKey}`,
          proposed_by_profile_id: "proposer-1",
          proposed_by_token_id: tokenId,
          token_name: "Ops token",
        }),
      }),
      db,
    );
    expect(mocks.createActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: "agent",
        actor_id: tokenId,
        actor_name: "Ops token",
        action: "propose manual message send",
        object_type: "approval",
        object_id: proposalId,
      }),
      db,
    );
    expect(mocks.completeCommandReceipt).toHaveBeenCalledWith(db, "receipt-1", result);
    expect(mocks.claimCommandReceipt).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        scope: "agent.proposal",
        actorId: "proposer-1",
        idempotencyKey,
        payload: expect.objectContaining({ targetApprovalId, tokenId }),
      }),
    );
  });

  it("replays the stored result without inserting or auditing again", async () => {
    const stored = {
      status: "pending_approval",
      approvalId: proposalId,
      targetApprovalId,
      requiresApproval: true,
      message: "stored",
    };
    mocks.claimCommandReceipt.mockResolvedValue({ kind: "replay", result: stored });

    await expect(proposeAgentActionCommand(proposer, validInput())).resolves.toEqual(stored);
    expect(mocks.createApproval).not.toHaveBeenCalled();
    expect(mocks.createActivityLog).not.toHaveBeenCalled();
  });

  it("fails closed when the target handoff no longer awaits a manual send", async () => {
    db = fakeDb({
      target: targetApproval(),
      handoff: { handoff_status: "manual_send_recorded", sent_reference: "already" },
    });
    await expectAdminError(
      proposeAgentActionCommand(proposer, validInput()),
      "CONFLICT",
      "The target message handoff is not awaiting a manual send",
    );
    expect(mocks.createApproval).not.toHaveBeenCalled();
  });

  it("fails closed when the target approval is not an approved message_send", async () => {
    db = fakeDb({ target: { ...targetApproval(), approval_type: "quote_send" }, handoff: null });
    await expectAdminError(
      proposeAgentActionCommand(proposer, validInput()),
      "CONFLICT",
      "The target message handoff is not awaiting a manual send",
    );
  });

  it("rejects unsupported actions, identifiers and bounds before opening a transaction", async () => {
    const invalid: Array<Partial<AgentActionProposalInput>> = [
      { action: "tidy_touchpoint_note" as AgentActionProposalInput["action"] },
      { targetApprovalId: "not-a-uuid" },
      { reference: "  ab  " },
      { idempotencyKey: "short" },
      { tokenId: "not-a-uuid" },
      { tokenName: "   " },
    ];
    for (const overrides of invalid) {
      await expectAdminError(
        proposeAgentActionCommand(proposer, validInput(overrides)),
        "VALIDATION_FAILED",
      );
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns the already-open proposal when the unique index wins a race", async () => {
    const open = approvalRow({ id: "existing-proposal", status: "pending" });
    db = fakeDb({
      target: targetApproval(),
      handoff: { handoff_status: "awaiting_manual_send", sent_reference: null },
      open,
    });
    mocks.createApproval.mockRejectedValue(
      Object.assign(new Error("duplicate"), { code: "23505" }),
    );

    const result = await proposeAgentActionCommand(proposer, validInput());

    expect(result.approvalId).toBe("existing-proposal");
    expect(mocks.createActivityLog).not.toHaveBeenCalled();
    const savepointQueries = (db.query as unknown as { mock: { calls: [string][] } }).mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.startsWith("savepoint agent_action_proposal_insert"));
    expect(savepointQueries).toHaveLength(1);
    const rolledBack = (db.query as unknown as { mock: { calls: [string][] } }).mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.includes("rollback to savepoint"));
    expect(rolledBack).toHaveLength(1);
  });
});

describe("applyAgentActionDecisionInTransaction", () => {
  it("executes the existing manual-send command under the approver and audits ids only", async () => {
    db = fakeDb({
      target: targetApproval(),
      handoff: { handoff_status: "awaiting_manual_send", sent_reference: null },
    });

    await applyAgentActionDecisionInTransaction(approvalRow({ status: "approved" }), approver, db);

    expect(mocks.recordManualMessageSentCommand).toHaveBeenCalledWith(
      approver,
      {
        approvalId: targetApprovalId,
        reference: "WA-12345",
        idempotencyKey: `agent_action:${proposalId}`,
      },
      db,
    );
    expect(mocks.createActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: "user",
        actor_id: "approver-1",
        action: "applied proposed manual message send",
        object_type: "approval",
        object_id: proposalId,
        diff_data: {
          proposal_id: proposalId,
          target_approval_id: targetApprovalId,
          action: "record_manual_message_sent",
          outcome: "manual_send_recorded",
        },
      }),
      db,
    );
  });

  it("denies self-approval before touching the target", async () => {
    await expectAdminError(
      applyAgentActionDecisionInTransaction(
        approvalRow({ status: "approved", requested_by_profile_id: "proposer-1" }),
        proposer,
        db,
      ),
      "FORBIDDEN",
      "A proposal cannot be approved by its proposer",
    );
    expect(mocks.recordManualMessageSentCommand).not.toHaveBeenCalled();
  });

  it("rejects an action outside the allowlist", async () => {
    const approval = approvalRow({
      status: "approved",
      context_data: proposalPayload({ action: "tidy_touchpoint_note" }),
    });
    await expectAdminError(
      applyAgentActionDecisionInTransaction(approval, approver, db),
      "CONFLICT",
      "The proposal payload is unavailable",
    );
    expect(mocks.recordManualMessageSentCommand).not.toHaveBeenCalled();
  });

  it("rejects a payload whose proposer no longer matches the recorded proposer", async () => {
    const approval = approvalRow({
      status: "approved",
      context_data: proposalPayload({ proposed_by_profile_id: "someone-else" }),
    });
    await expectAdminError(
      applyAgentActionDecisionInTransaction(approval, approver, db),
      "CONFLICT",
    );
  });

  it("fails closed when the target changed after the proposal was created", async () => {
    db = fakeDb({
      target: targetApproval(),
      handoff: { handoff_status: "manual_send_recorded", sent_reference: "already" },
    });
    await expectAdminError(
      applyAgentActionDecisionInTransaction(approvalRow({ status: "approved" }), approver, db),
      "CONFLICT",
      "The proposal target changed before the decision",
    );
    expect(mocks.recordManualMessageSentCommand).not.toHaveBeenCalled();
  });

  it("does nothing for rejected, escalated or non-agent approvals", async () => {
    for (const approval of [
      approvalRow({ status: "rejected" }),
      approvalRow({ status: "escalated" }),
      approvalRow({ status: "approved", approval_type: "message_send" }),
    ]) {
      await applyAgentActionDecisionInTransaction(approval, approver, db);
    }
    expect(mocks.recordManualMessageSentCommand).not.toHaveBeenCalled();
    expect(mocks.createActivityLog).not.toHaveBeenCalled();
  });
});

describe("parseAgentActionProposalPayload", () => {
  it("reads a complete payload and rejects drift", () => {
    expect(parseAgentActionProposalPayload(proposalPayload())).toEqual({
      action: "record_manual_message_sent",
      targetApprovalId,
      reference: "WA-12345",
      proposalKey: `${tokenId}:${idempotencyKey}`,
      proposedByProfileId: "proposer-1",
      proposedByTokenId: tokenId,
      tokenName: "Ops token",
    });
    expect(parseAgentActionProposalPayload(null)).toBeNull();
    expect(parseAgentActionProposalPayload({})).toBeNull();
    expect(
      parseAgentActionProposalPayload(proposalPayload({ action: "tidy_touchpoint_note" })),
    ).toBeNull();
    expect(parseAgentActionProposalPayload(proposalPayload({ reference: "ab" }))).toBeNull();
    expect(
      parseAgentActionProposalPayload(proposalPayload({ target_approval_id: "nope" })),
    ).toBeNull();
  });
});
