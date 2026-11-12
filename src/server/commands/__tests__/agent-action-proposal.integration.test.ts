import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/server/db/neon.server", () => ({
  transaction: async <T>(work: (db: Queryable) => Promise<T>): Promise<T> => {
    const client = await holder.pool!.connect();
    try {
      await client.query("begin");
      const result = await work({
        query: async <R>(sql: string, values: readonly unknown[] = []) => {
          const response = await client.query(sql, [...values]);
          return { rows: response.rows as R[] };
        },
      });
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },
  query: async (sql: string, values: readonly unknown[] = [], db?: { query: Pool["query"] }) =>
    (await (db ?? holder.pool!).query(sql, [...values])).rows,
  queryOne: async (sql: string, values: readonly unknown[] = [], db?: { query: Pool["query"] }) =>
    (await (db ?? holder.pool!).query(sql, [...values])).rows[0] ?? null,
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { proposeAgentActionCommand } from "@/server/commands/agent-action-proposal.server";
import { decideApprovalCommand } from "@/server/commands/approval-decision.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";
import type { AgentActionProposalInput, AgentActionProposalResult } from "@/lib/agent-actions";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const suffix = randomUUID().slice(0, 8);
const proposerId = `t20-proposer-${suffix}`;
const approverId = `t20-approver-${suffix}`;
const managerId = `t20-manager-${suffix}`;
const selfProposerId = `t20-self-${suffix}`;
const tokenId = randomUUID();

const createdTargets: string[] = [];
const createdProposals: string[] = [];
const proposalKeys: string[] = [];

const db = () => holder.pool!;

function context(
  profileId: string,
  role: RequestAuthorization["actor"]["role"],
): RequestAuthorization {
  return {
    session: { profile: { id: profileId, role, status: "active" } } as AppSession,
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

async function fixtureTarget(label: string): Promise<string> {
  const targetApprovalId = randomUUID();
  createdTargets.push(targetApprovalId);
  await db().query(
    `insert into human_approvals (id,approval_type,requested_by,status,context_data,context_summary)
     values ($1,'message_send','Reply Draft Agent','approved','{}'::jsonb,$2)`,
    [targetApprovalId, `Audit approved draft ${label}`],
  );
  await db().query(
    "insert into approval_message_handoffs (approval_id,handoff_status) values ($1,'awaiting_manual_send')",
    [targetApprovalId],
  );
  return targetApprovalId;
}

let keyCounter = 0;
function proposalInput(
  targetApprovalId: string,
  overrides: Partial<AgentActionProposalInput> = {},
): AgentActionProposalInput {
  keyCounter += 1;
  const key = `agent-t20-${suffix}-${keyCounter}`;
  return {
    action: "record_manual_message_sent",
    targetApprovalId,
    reference: "WA-AUDIT-9911",
    idempotencyKey: key,
    tokenId,
    tokenName: "Audit token",
    ...overrides,
  };
}

async function propose(
  actor: RequestAuthorization,
  targetApprovalId: string,
  overrides: Partial<AgentActionProposalInput> = {},
): Promise<{ result: AgentActionProposalResult; input: AgentActionProposalInput }> {
  const input = proposalInput(targetApprovalId, overrides);
  const result = await proposeAgentActionCommand(actor, input);
  createdProposals.push(result.approvalId);
  proposalKeys.push(input.idempotencyKey);
  return { result, input };
}

describe("governed agent action proposals on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 4 });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(db(), migrations);
    await db().query(
      "insert into profiles (id,email,name,role,status) values ($1,$2,'T20 Manager','manager','active')",
      [managerId, `${managerId}@audit-t20.test`],
    );
    await db().query(
      `insert into profiles (id,email,name,role,status,manager_profile_id)
       values ($1,$2,'T20 Proposer','sales','active',$3)`,
      [proposerId, `${proposerId}@audit-t20.test`, managerId],
    );
    await db().query(
      "insert into profiles (id,email,name,role,status) values ($1,$2,'T20 Approver','admin','active')",
      [approverId, `${approverId}@audit-t20.test`],
    );
    await db().query(
      "insert into profiles (id,email,name,role,status) values ($1,$2,'T20 Self Proposer','admin','active')",
      [selfProposerId, `${selfProposerId}@audit-t20.test`],
    );
  }, 60_000);

  afterAll(async () => {
    if (!holder.pool) return;
    const approvalIds = [...createdProposals, ...createdTargets];
    if (approvalIds.length) {
      await db().query(
        "delete from notifications where object_id = any($1::uuid[]) or user_id = any($2::text[])",
        [approvalIds, [proposerId, approverId, managerId, selfProposerId]],
      );
      await db().query("delete from activity_logs where object_id = any($1::uuid[])", [
        approvalIds,
      ]);
      await db().query(
        "delete from approval_message_handoffs where approval_id = any($1::uuid[])",
        [createdTargets],
      );
      await db().query("delete from human_approvals where id = any($1::uuid[])", [approvalIds]);
    }
    await db().query(
      `delete from command_receipts
       where actor_id = any($1::text[])
         and scope in ('agent.proposal','approval.decision','message.manual_send')`,
      [[proposerId, approverId, selfProposerId]],
    );
    await db().query("delete from profiles where id = any($1::text[])", [
      [proposerId, selfProposerId, approverId],
    ]);
    await db().query("delete from profiles where id = $1", [managerId]);
    await holder.pool.end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)(
    "proposes, lets a different approver execute, and replays the proposal idempotently",
    async () => {
      const target = await fixtureTarget("main");
      const { result, input } = await propose(context(proposerId, "sales"), target);

      expect(result).toMatchObject({
        status: "pending_approval",
        targetApprovalId: target,
        requiresApproval: true,
      });
      const pending = (
        await db().query<{
          status: string;
          requested_by_profile_id: string;
          assigned_to: string | null;
          context_data: Record<string, unknown>;
        }>(
          `select status,requested_by_profile_id,assigned_to,context_data
           from human_approvals where id=$1`,
          [result.approvalId],
        )
      ).rows[0];
      expect(pending).toMatchObject({
        status: "pending",
        requested_by_profile_id: proposerId,
        assigned_to: managerId,
      });
      expect(pending.context_data).toMatchObject({
        action: "record_manual_message_sent",
        target_approval_id: target,
        reference: input.reference,
        proposal_key: `${tokenId}:${input.idempotencyKey}`,
        proposed_by_profile_id: proposerId,
        proposed_by_token_id: tokenId,
        token_name: "Audit token",
      });

      const decided = await decideApprovalCommand(context(approverId, "admin"), {
        id: result.approvalId,
        decision: "approved",
        expectedVersion: 0,
        idempotencyKey: randomUUID(),
      });
      expect(decided.status).toBe("approved");

      const handoff = (
        await db().query<{
          handoff_status: string;
          sent_reference: string | null;
          recorded_by: string | null;
        }>(
          "select handoff_status,sent_reference,recorded_by from approval_message_handoffs where approval_id=$1",
          [target],
        )
      ).rows[0];
      expect(handoff).toMatchObject({
        handoff_status: "manual_send_recorded",
        sent_reference: input.reference,
        recorded_by: approverId,
      });

      const logs = await db().query<{ action: string; actor_type: string; actor_id: string }>(
        "select action,actor_type,actor_id from activity_logs where object_id = any($1::uuid[]) order by created_at",
        [[result.approvalId, target]],
      );
      expect(logs.rows.map((row) => row.action)).toEqual(
        expect.arrayContaining([
          "propose manual message send",
          "approved approval",
          "recorded manual message send",
          "applied proposed manual message send",
        ]),
      );
      expect(logs.rows.find((row) => row.action === "propose manual message send")).toMatchObject({
        actor_type: "agent",
        actor_id: tokenId,
      });

      const replay = await proposeAgentActionCommand(context(proposerId, "sales"), input);
      expect(replay.approvalId).toBe(result.approvalId);
      const openCount = await db().query<{ count: number }>(
        `select count(*)::int as count from human_approvals
         where context_data->>'proposal_key'=$1`,
        [`${tokenId}:${input.idempotencyKey}`],
      );
      expect(openCount.rows[0].count).toBe(1);
    },
  );

  it.runIf(hasDatabase)("never lets the proposer decide their own proposal", async () => {
    const target = await fixtureTarget("self");
    const { result } = await propose(context(selfProposerId, "admin"), target);

    await expect(
      decideApprovalCommand(context(selfProposerId, "admin"), {
        id: result.approvalId,
        decision: "approved",
        expectedVersion: 0,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const proposal = (
      await db().query<{ status: string; row_version: number }>(
        "select status,row_version from human_approvals where id=$1",
        [result.approvalId],
      )
    ).rows[0];
    expect(proposal).toEqual({ status: "pending", row_version: 0 });
    const handoff = (
      await db().query<{ handoff_status: string }>(
        "select handoff_status from approval_message_handoffs where approval_id=$1",
        [target],
      )
    ).rows[0];
    expect(handoff.handoff_status).toBe("awaiting_manual_send");
  });

  it.runIf(hasDatabase)("rejects without executing the proposed action", async () => {
    const target = await fixtureTarget("rejected");
    const { result } = await propose(context(proposerId, "sales"), target);

    const decided = await decideApprovalCommand(context(approverId, "admin"), {
      id: result.approvalId,
      decision: "rejected",
      notes: "Reference does not match the send",
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
    });
    expect(decided.status).toBe("rejected");

    const handoff = (
      await db().query<{ handoff_status: string; sent_reference: string | null }>(
        "select handoff_status,sent_reference from approval_message_handoffs where approval_id=$1",
        [target],
      )
    ).rows[0];
    expect(handoff).toEqual({ handoff_status: "awaiting_manual_send", sent_reference: null });
    const applied = await db().query(
      "select 1 from activity_logs where action='applied proposed manual message send' and object_id=$1",
      [result.approvalId],
    );
    expect(applied.rows).toHaveLength(0);
  });

  it.runIf(hasDatabase)(
    "fails closed and rolls the decision back when the target changed after the proposal",
    async () => {
      const target = await fixtureTarget("drifted");
      const { result } = await propose(context(proposerId, "sales"), target);
      await db().query(
        `update approval_message_handoffs
         set handoff_status='manual_send_recorded',sent_reference='manual-other',
             recorded_by=$2,recorded_at=now()
         where approval_id=$1`,
        [target, approverId],
      );

      await expect(
        decideApprovalCommand(context(approverId, "admin"), {
          id: result.approvalId,
          decision: "approved",
          expectedVersion: 0,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      const proposal = (
        await db().query<{ status: string; row_version: number; decided_at: string | null }>(
          "select status,row_version,decided_at from human_approvals where id=$1",
          [result.approvalId],
        )
      ).rows[0];
      expect(proposal).toEqual({ status: "pending", row_version: 0, decided_at: null });
      const handoff = (
        await db().query<{ handoff_status: string; sent_reference: string }>(
          "select handoff_status,sent_reference from approval_message_handoffs where approval_id=$1",
          [target],
        )
      ).rows[0];
      expect(handoff).toEqual({
        handoff_status: "manual_send_recorded",
        sent_reference: "manual-other",
      });
    },
  );

  it.runIf(hasDatabase)("escalation never executes the proposed action", async () => {
    const target = await fixtureTarget("escalated");
    const { result } = await propose(context(proposerId, "sales"), target);

    const decided = await decideApprovalCommand(context(approverId, "admin"), {
      id: result.approvalId,
      decision: "escalated",
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
    });
    expect(decided.status).toBe("escalated");
    const handoff = (
      await db().query<{ handoff_status: string }>(
        "select handoff_status from approval_message_handoffs where approval_id=$1",
        [target],
      )
    ).rows[0];
    expect(handoff.handoff_status).toBe("awaiting_manual_send");
  });
});
