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
import {
  claimApprovalCommand,
  canClaimApproval,
  recoverAgentRunCommand,
} from "@/server/commands/agent-recovery.server";
import { loadAgentRecoveryAccess } from "@/server/read-models/agent-recovery-access";
import { requirePageAuthorization } from "@/server/auth/authorization.server";
import { createAgentRun, updateAgentRunResult } from "@/server/repositories/agent-runs";
import { writeReplyDraftResult } from "@/server/workflows/writebacks";
import { listClaimableApprovals } from "@/server/repositories/approvals";
import { decideApprovalCommand } from "@/server/commands/approval-decision.server";
import { recordManualMessageSentCommand } from "@/server/commands/message-handoff.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { HumanApproval } from "@/lib/types";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const managerA = "audit-recovery-manager-a";
const managerB = "audit-recovery-manager-b";
const report = "audit-recovery-report";
const outsider = "audit-recovery-outsider";
const profiles = [managerA, managerB, report, outsider];
const fixtures: Array<{ leadId: string; runId: string; approvalId: string }> = [];
const db = () => holder.pool!;
function context(id: string, reports: string[] = []): RequestAuthorization {
  return {
    session: { profile: { id, role: "manager", status: "active" } } as AppSession,
    actor: {
      profileId: id,
      role: "manager",
      status: "active",
      managedDepartmentIds: [],
      managedTeamIds: [],
      directReportIds: reports,
    },
    overrides: [],
    now: new Date(),
  };
}
async function fixture(owner: string | null = report) {
  const leadId = randomUUID(),
    runId = randomUUID(),
    approvalId = randomUUID();
  fixtures.push({ leadId, runId, approvalId });
  await db().query(
    "insert into leads (id,company_name,assigned_to) values ($1,'Audit Recovery Lead',$2)",
    [leadId, owner],
  );
  await db().query(
    `insert into agent_runs (id,agent_name,workflow_type,subject_type,subject_id,status,human_review_required,output_data,created_at)
     values ($1,'Reply Draft Agent','draft_reply','lead',$2,'waiting_approval',true,$3::jsonb,now()-interval '2 hours')`,
    [runId, leadId, JSON.stringify({ approval_id: approvalId, draft_message: "Draft only" })],
  );
  await db().query(
    `insert into human_approvals (id,agent_run_id,approval_type,status,context_data)
     values ($1,$2,'message_send','pending',$3::jsonb)`,
    [approvalId, runId, JSON.stringify({ draft_message: "Draft only" })],
  );
  return { leadId, runId, approvalId };
}

describe("approval claim and agent recovery on isolated PostgreSQL", () => {
  it.runIf(hasDatabase)(
    "reuses the real view-owner batch for recovery hints without caching capability verdicts",
    async () => {
      const f = await fixture(report);
      const run = (await db().query("select * from agent_runs where id=$1", [f.runId])).rows[0];
      const request = context(managerA, [report]);
      const { rows } = await requirePageAuthorization(["agents.view"], {
        context: request,
        cacheRowOwners: true,
      });
      const spy = vi.spyOn(db(), "query");
      try {
        expect((await rows.allow("leads.view", "lead", [f.leadId])).get(f.leadId)).toBe(true);
        expect((await loadAgentRecoveryAccess(request, [run], rows)).get(f.runId)?.cancel).toBe(
          true,
        );
        expect(spy).toHaveBeenCalledTimes(2);
        expect((await rows.allow("permissions.override", "lead", [f.leadId])).get(f.leadId)).toBe(
          false,
        );
        expect(spy).toHaveBeenCalledTimes(2);
      } finally {
        spy.mockRestore();
      }
    },
  );
  it.runIf(hasDatabase)(
    "assesses 25 real rows with one owner batch and one linked-review read",
    async () => {
      const runs = [];
      for (let index = 0; index < 25; index++) {
        const f = await fixture(report);
        runs.push((await db().query("select * from agent_runs where id=$1", [f.runId])).rows[0]);
      }
      const before = (
        await db().query("select * from agent_runs where id=any($1::uuid[]) order by id", [
          runs.map((run) => run.id),
        ])
      ).rows;
      const spy = vi.spyOn(db(), "query");
      try {
        const access = await loadAgentRecoveryAccess(context(managerA, [report]), runs);
        expect(access.size).toBe(25);
        expect(
          [...access.values()].every((value) => value.cancel && value.expire && !value.retry),
        ).toBe(true);
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy.mock.calls[0][1]).toEqual([runs.map((run) => run.subject_id)]);
        expect(spy.mock.calls[1][1]).toEqual([runs.map((run) => run.id)]);
        expect(
          spy.mock.calls.every(
            ([sql]) => typeof sql === "string" && sql.trim().startsWith("select"),
          ),
        ).toBe(true);
      } finally {
        spy.mockRestore();
      }
      expect(
        (
          await db().query("select * from agent_runs where id=any($1::uuid[]) order by id", [
            runs.map((run) => run.id),
          ])
        ).rows,
      ).toEqual(before);
    },
  );
  it.runIf(hasDatabase).each([
    ["super_admin", true, true],
    ["admin", true, true],
    ["manager", true, true],
    ["sales", true, false],
    ["client_success", true, false],
    ["accounting", false, false],
    ["read_only", false, false],
  ] as const)(
    "matches %s recovery affordances to actual grants and linked review",
    async (role, runningAllowed, waitingAllowed) => {
      const f = await fixture(report);
      const request = context(managerA, [report]);
      request.actor.role = role;
      const waiting = (await db().query("select * from agent_runs where id=$1", [f.runId])).rows[0];
      expect((await loadAgentRecoveryAccess(request, [waiting])).get(f.runId)).toEqual({
        cancel: waitingAllowed,
        expire: waitingAllowed,
        retry: false,
      });
      await db().query("update human_approvals set status='rejected' where id=$1", [f.approvalId]);
      await db().query("update agent_runs set status='running' where id=$1", [f.runId]);
      const running = (await db().query("select * from agent_runs where id=$1", [f.runId])).rows[0];
      expect((await loadAgentRecoveryAccess(request, [running])).get(f.runId)).toEqual({
        cancel: runningAllowed,
        expire: runningAllowed,
        retry: runningAllowed,
      });
    },
  );
  it.runIf(hasDatabase)(
    "requires proven owner, active actor and manager scope even for read-only affordances",
    async () => {
      for (const owner of [null, outsider]) {
        const f = await fixture(owner);
        const run = (await db().query("select * from agent_runs where id=$1", [f.runId])).rows[0];
        expect(
          (await loadAgentRecoveryAccess(context(managerA, [report]), [run])).get(f.runId),
        ).toEqual({ cancel: false, expire: false, retry: false });
        if (!owner) {
          const root = context(managerA);
          root.actor.role = "super_admin";
          expect((await loadAgentRecoveryAccess(root, [run])).get(f.runId)?.cancel).toBe(false);
        }
      }
      const f = await fixture(report),
        run = (await db().query("select * from agent_runs where id=$1", [f.runId])).rows[0],
        request = context(managerA, [report]);
      request.actor.status = "deactivated";
      expect((await loadAgentRecoveryAccess(request, [run])).get(f.runId)?.cancel).toBe(false);
    },
  );
  it.runIf(hasDatabase)(
    "uses exact run/review overrides, expiry and persisted assignee",
    async () => {
      const f = await fixture(report),
        run = (await db().query("select * from agent_runs where id=$1", [f.runId])).rows[0],
        request = context(managerA, [report]);
      request.overrides = [
        {
          profileId: managerA,
          capability: "agents.run",
          effect: "deny",
          resourceType: "lead",
          resourceId: f.leadId,
        },
      ];
      expect((await loadAgentRecoveryAccess(request, [run])).get(f.runId)?.cancel).toBe(false);
      request.overrides[0].resourceId = randomUUID();
      expect((await loadAgentRecoveryAccess(request, [run])).get(f.runId)?.cancel).toBe(true);
      request.overrides = [
        {
          profileId: managerA,
          capability: "approvals.decide",
          effect: "deny",
          resourceType: "human_approval",
          resourceId: f.approvalId,
        },
      ];
      expect((await loadAgentRecoveryAccess(request, [run])).get(f.runId)?.cancel).toBe(false);
      request.overrides[0].expiresAt = new Date(Date.now() - 1000).toISOString();
      expect((await loadAgentRecoveryAccess(request, [run])).get(f.runId)?.cancel).toBe(true);
      request.overrides = [];
      await db().query("update human_approvals set assigned_to=$2 where id=$1", [
        f.approvalId,
        outsider,
      ]);
      expect((await loadAgentRecoveryAccess(request, [run])).get(f.runId)?.cancel).toBe(false);
    },
  );
  it.runIf(hasDatabase)(
    "keeps young cancel available, withholds young retry/expiry and inconsistent open reviews",
    async () => {
      const f = await fixture(report);
      await db().query("update agent_runs set created_at=now() where id=$1", [f.runId]);
      const request = context(managerA, [report]);
      let run = (await db().query("select * from agent_runs where id=$1", [f.runId])).rows[0];
      expect((await loadAgentRecoveryAccess(request, [run])).get(f.runId)).toEqual({
        cancel: true,
        expire: false,
        retry: false,
      });
      await db().query("update agent_runs set status='running' where id=$1", [f.runId]);
      run = (await db().query("select * from agent_runs where id=$1", [f.runId])).rows[0];
      expect((await loadAgentRecoveryAccess(request, [run])).get(f.runId)).toEqual({
        cancel: false,
        expire: false,
        retry: false,
      });
    },
  );

  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 4 });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(db(), migrations);
    for (const id of profiles) {
      const role = id === report || id === outsider ? "sales" : "manager";
      await db().query(
        "insert into profiles (id,email,name,role,status) values ($1,$2,$1,$3,'active') on conflict (id) do update set role=$3,status='active'",
        [id, id + "@audit-recovery.test", role],
      );
    }
  }, 60_000);
  afterAll(async () => {
    if (!holder.pool) return;
    if (fixtures.length > 0) {
      const approvalIds = fixtures.map((fixture) => fixture.approvalId);
      const runIds = fixtures.map((fixture) => fixture.runId);
      const leadIds = fixtures.map((fixture) => fixture.leadId);
      await db().query(
        "delete from command_receipts where result->>'id'=any($1::text[]) or result->>'approvalId'=any($2::text[])",
        [[...approvalIds, ...runIds], approvalIds],
      );
      await db().query(
        "delete from activity_logs where (object_type='approval' and object_id=any($1::uuid[])) or (object_type='agent_run' and object_id=any($2::uuid[]))",
        [approvalIds, runIds],
      );
      await db().query("delete from human_approvals where id=any($1::uuid[])", [approvalIds]);
      await db().query("delete from agent_runs where retry_of=any($1::uuid[])", [runIds]);
      await db().query("delete from agent_runs where id=any($1::uuid[])", [runIds]);
      await db().query("delete from leads where id=any($1::uuid[])", [leadIds]);
    }
    await db().query("delete from profiles where id=any($1::text[])", [profiles]);
    await holder.pool.end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)(
    "evaluates a claim in READ ONLY without changing the approval or taking a row write lock",
    async () => {
      const f = await fixture(report);
      const client = await db().connect();
      try {
        await client.query("begin read only");
        const approval = (
          await client.query<HumanApproval>("select * from human_approvals where id=$1", [
            f.approvalId,
          ])
        ).rows[0];
        const reader: Queryable = {
          query: async <T>(sql: string, values: readonly unknown[] = []) => ({
            rows: (await client.query(sql, [...values])).rows as T[],
          }),
        };
        expect(await canClaimApproval(context(managerA, [report]), approval, reader)).toBe(true);
        expect(await canClaimApproval(context(managerB), approval, reader)).toBe(false);
        const after = (
          await client.query("select assigned_to,row_version from human_approvals where id=$1", [
            f.approvalId,
          ])
        ).rows[0];
        expect(after).toEqual({ assigned_to: null, row_version: 0 });
        await client.query("rollback");
      } finally {
        client.release();
      }
    },
  );
  it.runIf(hasDatabase)(
    "withholds claim affordances when linked subject proof is absent",
    async () => {
      const f = await fixture(null);
      const approval = (
        await db().query<HumanApproval>("select * from human_approvals where id=$1", [f.approvalId])
      ).rows[0];
      expect(await canClaimApproval(context(managerA, [report]), approval)).toBe(false);
      expect(
        await canClaimApproval(context(managerA, [report]), { ...approval, agent_run_id: null }),
      ).toBe(false);
    },
  );

  it.runIf(hasDatabase)("lists only in-scope unassigned work with a redacted payload", async () => {
    const owned = await fixture(report);
    const unrelated = await fixture(outsider);
    const unowned = await fixture(null);
    const rows = await listClaimableApprovals(context(managerA, [report]));
    expect(rows.map((row) => row.id)).toContain(owned.approvalId);
    expect(rows.map((row) => row.id)).not.toContain(unrelated.approvalId);
    expect(rows.map((row) => row.id)).not.toContain(unowned.approvalId);
    expect(rows.find((row) => row.id === owned.approvalId)?.context_data).toEqual({});
  });

  it.runIf(hasDatabase)(
    "lets a manager claim only a linked subject owned by a direct report",
    async () => {
      const f = await fixture(report);
      const key = randomUUID();
      const input = { id: f.approvalId, expectedVersion: 0, idempotencyKey: key };
      const first = await claimApprovalCommand(context(managerA, [report]), input);
      const replay = await claimApprovalCommand(context(managerA, [report]), input);
      expect(first).toMatchObject({ id: f.approvalId, assigned_to: managerA, row_version: 1 });
      expect(replay.row_version).toBe(first.row_version);
      expect(
        (
          await db().query(
            "select id from activity_logs where object_type='approval' and object_id=$1",
            [f.approvalId],
          )
        ).rows,
      ).toHaveLength(1);
    },
  );

  it.runIf(hasDatabase)(
    "fails closed when the subject owner is unknown or outside manager scope",
    async () => {
      for (const owner of [null, outsider]) {
        const f = await fixture(owner);
        await expect(
          claimApprovalCommand(context(managerA, [report]), {
            id: f.approvalId,
            expectedVersion: 0,
            idempotencyKey: randomUUID(),
          }),
        ).rejects.toMatchObject({ code: "OUTSIDE_SCOPE" });
        expect(
          (
            await db().query("select assigned_to,status from human_approvals where id=$1", [
              f.approvalId,
            ])
          ).rows[0],
        ).toMatchObject({ assigned_to: null, status: "pending" });
      }
    },
  );

  it.runIf(hasDatabase)(
    "allows only one of two concurrent managers to claim the same request",
    async () => {
      const f = await fixture(report);
      const attempts = await Promise.allSettled([
        claimApprovalCommand(context(managerA, [report]), {
          id: f.approvalId,
          expectedVersion: 0,
          idempotencyKey: randomUUID(),
        }),
        claimApprovalCommand(context(managerB, [report]), {
          id: f.approvalId,
          expectedVersion: 0,
          idempotencyKey: randomUUID(),
        }),
      ]);
      expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
      expect(
        (await db().query("select row_version from human_approvals where id=$1", [f.approvalId]))
          .rows[0].row_version,
      ).toBe(1);
    },
  );

  it.runIf(hasDatabase)(
    "records approved draft as awaiting manual send, then an explicit human statement",
    async () => {
      const f = await fixture(report);
      await claimApprovalCommand(context(managerA, [report]), {
        id: f.approvalId,
        expectedVersion: 0,
        idempotencyKey: randomUUID(),
      });
      await decideApprovalCommand(context(managerA, [report]), {
        id: f.approvalId,
        decision: "approved",
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
      });
      const pending = (
        await db().query(
          "select handoff_status,sent_reference from approval_message_handoffs where approval_id=$1",
          [f.approvalId],
        )
      ).rows[0];
      expect(pending).toMatchObject({
        handoff_status: "awaiting_manual_send",
        sent_reference: null,
      });
      const key = randomUUID();
      const input = {
        approvalId: f.approvalId,
        reference: "Operator sent via approved channel #123",
        idempotencyKey: key,
      };
      const first = await recordManualMessageSentCommand(context(managerA, [report]), input);
      const replay = await recordManualMessageSentCommand(context(managerA, [report]), input);
      expect(first).toMatchObject({
        handoff_status: "manual_send_recorded",
        sent_reference: input.reference,
      });
      expect(new Date(replay.recorded_at!).toISOString()).toEqual(
        new Date(first.recorded_at!).toISOString(),
      );
      expect(
        (await db().query("select outcome_code from agent_runs where id=$1", [f.runId])).rows[0]
          .outcome_code,
      ).toBe("manual_send_recorded");
      expect(
        (
          await db().query(
            "select id from activity_logs where object_type='approval' and object_id=$1 and action='recorded manual message send'",
            [f.approvalId],
          )
        ).rows,
      ).toHaveLength(1);
    },
  );

  it.runIf(hasDatabase)(
    "links a requested retry to one new attempt without dispatching a message",
    async () => {
      const f = await fixture(report);
      await db().query("delete from human_approvals where id=$1", [f.approvalId]);
      await db().query(
        "update agent_runs set status='running',human_review_required=false where id=$1",
        [f.runId],
      );
      const key = randomUUID();
      const input = {
        runId: f.runId,
        action: "retry" as const,
        reason: "Original callback did not arrive",
        idempotencyKey: key,
      };
      const closed = await recoverAgentRunCommand(context(managerA, [report]), input);
      const replay = await recoverAgentRunCommand(context(managerA, [report]), input);
      expect(closed).toMatchObject({ status: "failed", outcome_code: "retry_requested" });
      expect(replay.id).toBe(closed.id);
      const created = await createAgentRun({
        agent_name: "Reply Draft Agent",
        workflow_type: "draft_reply",
        subject_type: "lead",
        subject_id: f.leadId,
        input_data: { lead_id: f.leadId },
        created_by: report,
      });
      expect(created.created).toBe(true);
      expect(created.run.retry_of).toBe(f.runId);
      expect(created.run.attempt_id).not.toBe(closed.attempt_id);
      expect(
        (await db().query("select outcome_code from agent_runs where id=$1", [f.runId])).rows[0]
          .outcome_code,
      ).toBe("superseded");
      const duplicate = await createAgentRun({
        agent_name: "Reply Draft Agent",
        workflow_type: "draft_reply",
        subject_type: "lead",
        subject_id: f.leadId,
        input_data: { lead_id: f.leadId },
        created_by: managerA,
      });
      expect(duplicate.created).toBe(false);
      expect(duplicate.run.id).toBe(created.run.id);
    },
  );

  it.runIf(hasDatabase)(
    "rolls back run, approval, audit and receipt when PostgreSQL audit insert fails",
    async () => {
      const f = await fixture(report);
      const key = randomUUID();
      await db()
        .query(`create or replace function audit_fail_recovery_insert() returns trigger language plpgsql as $$
      begin if new.object_type='agent_run' and new.object_id='${f.runId}'::uuid
      then raise exception 'audit injected recovery failure'; end if; return new; end $$`);
      await db().query(
        "create trigger audit_fail_recovery_insert before insert on activity_logs for each row execute function audit_fail_recovery_insert()",
      );
      try {
        await expect(
          recoverAgentRunCommand(context(managerA, [report]), {
            runId: f.runId,
            action: "expire",
            reason: "Provider callback absent after two hours",
            idempotencyKey: key,
          }),
        ).rejects.toThrow("audit injected recovery failure");
      } finally {
        await db().query("drop trigger audit_fail_recovery_insert on activity_logs");
        await db().query("drop function audit_fail_recovery_insert()");
      }
      expect(
        (await db().query("select status,outcome_code from agent_runs where id=$1", [f.runId]))
          .rows[0],
      ).toMatchObject({ status: "waiting_approval", outcome_code: null });
      expect(
        (
          await db().query("select status,recovery_outcome_code from human_approvals where id=$1", [
            f.approvalId,
          ])
        ).rows[0],
      ).toMatchObject({ status: "pending", recovery_outcome_code: null });
      expect(
        (
          await db().query("select id from activity_logs where object_id=any($1::uuid[])", [
            [f.runId, f.approvalId],
          ])
        ).rows,
      ).toHaveLength(0);
      expect(
        (await db().query("select id from command_receipts where idempotency_key=$1", [key])).rows,
      ).toHaveLength(0);
    },
  );

  it.runIf(hasDatabase)("expires a stuck run and refuses its late callback", async () => {
    const f = await fixture(report);
    const result = await recoverAgentRunCommand(context(managerA, [report]), {
      runId: f.runId,
      action: "expire",
      reason: "Provider callback absent after two hours",
      idempotencyKey: randomUUID(),
    });
    expect(result).toMatchObject({ id: f.runId, status: "failed", outcome_code: "expired" });
    await expect(
      updateAgentRunResult(f.runId, {
        status: "completed",
        output_data: { draft_message: "Late callback" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await db().query("select status,outcome_code from agent_runs where id=$1", [f.runId]))
        .rows[0],
    ).toMatchObject({ status: "failed", outcome_code: "expired" });
  });
  it.runIf(hasDatabase)("rolls back a late draft callback and its proposed approval", async () => {
    const f = await fixture(report);
    await recoverAgentRunCommand(context(managerA, [report]), {
      runId: f.runId,
      action: "expire",
      reason: "Provider callback absent after two hours",
      idempotencyKey: randomUUID(),
    });
    const before = await db().query(
      "select count(*)::int as count from human_approvals where agent_run_id=$1",
      [f.runId],
    );
    await expect(
      writeReplyDraftResult({
        lead_id: f.leadId,
        agent_run_id: f.runId,
        draft_message: "Late draft must be discarded",
        context_summary: "Late result",
        confidence_score: 0.7,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const after = await db().query(
      "select count(*)::int as count from human_approvals where agent_run_id=$1",
      [f.runId],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
    expect(
      (await db().query("select status,outcome_code from agent_runs where id=$1", [f.runId]))
        .rows[0],
    ).toMatchObject({ status: "failed", outcome_code: "expired" });
  });
});
