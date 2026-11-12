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
import { listApproverProfileIds } from "@/server/repositories/notifications";
import { escalateOverdueApprovalsBatch } from "@/server/workflows/approval-sla.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

// The Lead owns the registry entry for 032; until it lands, apply the file here so this test is
// self-sufficient. When the registry includes it the append is skipped, and the runner's
// sorted-path assertion still holds because 032 sorts after every registered migration.
const SLA_MIGRATION_PATH = "neon/migrations/032_approval_sla_escalation.sql";
const registeredPaths: readonly string[] = CLIENTOPS_MIGRATION_PATHS;
const migrationPaths = registeredPaths.includes(SLA_MIGRATION_PATH)
  ? [...registeredPaths]
  : [...registeredPaths, SLA_MIGRATION_PATH];

const suffix = randomUUID().slice(0, 8);
const approverAdminId = `t26-ap-admin-${suffix}`;
const approverManagerId = `t26-ap-manager-${suffix}`;
const proposerAdminId = `t26-proposer-${suffix}`;
const suspendedAdminId = `t26-ap-suspended-${suffix}`;
const salesId = `t26-sales-${suffix}`;
const approvalIds: string[] = [];
const profileIds = [approverAdminId, approverManagerId, proposerAdminId, suspendedAdminId, salesId];

const db = () => holder.pool!;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

async function insertApproval(input: {
  status: "pending" | "approved" | "escalated";
  createdMinutesAgo: number;
  approvalType?: string;
  requestedByProfileId?: string | null;
  assignedTo?: string | null;
  contextSummary?: string | null;
}): Promise<string> {
  const id = randomUUID();
  approvalIds.push(id);
  await db().query(
    `insert into human_approvals
       (id,approval_type,status,requested_by,requested_by_profile_id,assigned_to,
        context_summary,created_at)
     values ($1,$2,$3,'Fixture Agent',$4,$5,$6,$7::timestamptz)`,
    [
      id,
      input.approvalType ?? "message_send",
      input.status,
      input.requestedByProfileId ?? null,
      input.assignedTo ?? null,
      input.contextSummary ?? null,
      minutesAgo(input.createdMinutesAgo),
    ],
  );
  return id;
}

async function state(approvalId: string) {
  const row = (
    await db().query<{
      status: string;
      row_version: number;
      sla_escalated_at: string | null;
      assigned_to: string | null;
    }>("select status,row_version,sla_escalated_at,assigned_to from human_approvals where id=$1", [
      approvalId,
    ])
  ).rows[0];
  return row;
}

async function logs(approvalId: string) {
  return (
    await db().query<{
      actor_type: string;
      actor_id: string;
      actor_name: string;
      action: string;
      object_type: string;
      diff_data: { approval_type: string; age_minutes: number };
    }>(
      `select actor_type,actor_id,actor_name,action,object_type,diff_data
       from activity_logs where object_type='approval' and object_id=$1`,
      [approvalId],
    )
  ).rows;
}

async function notifications(approvalId: string) {
  return (
    await db().query<{ user_id: string; type: string; title: string; body: string | null }>(
      "select user_id,type,title,body from notifications where object_id=$1 order by user_id",
      [approvalId],
    )
  ).rows;
}

describe("approval SLA escalation writer on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 4 });
    const migrations = await Promise.all(
      migrationPaths.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(db(), migrations);
    for (const [id, role, status] of [
      [approverAdminId, "admin", "active"],
      [approverManagerId, "manager", "active"],
      [proposerAdminId, "admin", "active"],
      [suspendedAdminId, "admin", "suspended"],
      [salesId, "sales", "active"],
    ] as const) {
      await db().query("insert into profiles (id,email,name,role,status) values ($1,$2,$3,$4,$5)", [
        id,
        `${id}@audit-t26.test`,
        `T26 ${role}`,
        role,
        status,
      ]);
    }
  }, 60_000);

  afterAll(async () => {
    if (!holder.pool) return;
    if (approvalIds.length) {
      await db().query(
        "delete from notifications where object_id = any($1::uuid[]) or user_id = any($2::text[])",
        [approvalIds, profileIds],
      );
      await db().query("delete from activity_logs where object_id = any($1::uuid[])", [
        approvalIds,
      ]);
      await db().query("delete from human_approvals where id = any($1::uuid[])", [approvalIds]);
    }
    await db().query("delete from profiles where id = any($1::text[])", [profileIds]);
    await holder.pool.end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)(
    "stamps only overdue pending approvals, audits them and notifies approvers minus the proposer",
    async () => {
      const proposerApproval = await insertApproval({
        status: "pending",
        createdMinutesAgo: 300,
        requestedByProfileId: proposerAdminId,
        assignedTo: approverManagerId,
        contextSummary: "Audit overdue message draft",
      });
      const plainApproval = await insertApproval({
        status: "pending",
        createdMinutesAgo: 360,
        approvalType: "cs_risk_review",
        contextSummary: "Audit overdue risk review",
      });
      const freshApproval = await insertApproval({ status: "pending", createdMinutesAgo: 60 });
      const approvedApproval = await insertApproval({
        status: "approved",
        createdMinutesAgo: 300,
      });
      const escalatedApproval = await insertApproval({
        status: "escalated",
        createdMinutesAgo: 300,
      });

      const result = await escalateOverdueApprovalsBatch({
        now: Date.now(),
        limit: 10,
        deadlineAt: Date.now() + 10_000,
      });
      expect(result).toMatchObject({ escalated: 2, skipped: 0, complete: true, batches: 1 });
      expect(result.scanned).toBe(2);
      expect(new Date(result.cutoff).getTime()).toBeLessThan(Date.now() - 4 * 3600_000 + 2000);

      const proposerState = await state(proposerApproval);
      expect(proposerState.status).toBe("pending");
      expect(proposerState.sla_escalated_at).not.toBeNull();
      expect(proposerState.row_version).toBe(1);
      expect(proposerState.assigned_to).toBe(approverManagerId);

      expect((await state(plainApproval)).sla_escalated_at).not.toBeNull();
      for (const untouched of [freshApproval, approvedApproval, escalatedApproval]) {
        expect((await state(untouched)).sla_escalated_at).toBeNull();
      }
      expect((await state(approvedApproval)).status).toBe("approved");
      expect((await state(escalatedApproval)).status).toBe("escalated");

      const proposerLogs = await logs(proposerApproval);
      expect(proposerLogs).toHaveLength(1);
      expect(proposerLogs[0]).toMatchObject({
        actor_type: "agent",
        actor_id: "system:approval-sla",
        actor_name: "Approval SLA",
        action: "escalated overdue approval",
        object_type: "approval",
      });
      expect(proposerLogs[0].diff_data).toMatchObject({ approval_type: "message_send" });
      expect(proposerLogs[0].diff_data.age_minutes).toBeGreaterThanOrEqual(290);

      // The roster is derived from the live policy, and this shared test database can contain
      // active approver fixtures from other integration files, so assert against the actual
      // roster instead of assuming it is exactly this file's two approvers.
      const roster = [...(await listApproverProfileIds())].sort();
      expect(roster).toContain(approverAdminId);
      expect(roster).toContain(approverManagerId);
      expect(roster).not.toContain(suspendedAdminId);
      expect(roster).not.toContain(salesId);

      // The proposer is an active approver but must not be nudged about their own proposal.
      const proposerNotifications = await notifications(proposerApproval);
      expect(proposerNotifications.map((row) => row.user_id)).toEqual(
        roster.filter((id) => id !== proposerAdminId),
      );
      expect(proposerNotifications.every((row) => row.user_id !== proposerAdminId)).toBe(true);
      expect(proposerNotifications.every((row) => row.type === "approval_escalated")).toBe(true);
      expect(proposerNotifications[0].title).toBe("Approval overdue: Message send");
      expect(proposerNotifications[0].body).toBe("Audit overdue message draft");

      // A plain approval has no proposer, so the whole active roster hears about it.
      const plainNotifications = await notifications(plainApproval);
      expect(plainNotifications.map((row) => row.user_id)).toEqual(roster);
      expect(plainNotifications[0].title).toBe("Approval overdue: Risk review");
      expect(result.notified).toBe(proposerNotifications.length + plainNotifications.length);

      const informedElsewhere = await db().query(
        "select 1 from notifications where object_id = any($1::uuid[]) and user_id = any($2::text[])",
        [
          [proposerApproval, plainApproval],
          [suspendedAdminId, salesId],
        ],
      );
      expect(informedElsewhere.rows).toHaveLength(0);
    },
  );

  it.runIf(hasDatabase)(
    "is idempotent on rerun: no restamp and no duplicate notification",
    async () => {
      const overdue = await insertApproval({
        status: "pending",
        createdMinutesAgo: 280,
        requestedByProfileId: proposerAdminId,
      });
      const roster = await listApproverProfileIds();
      const expectedRecipients = roster.filter((id) => id !== proposerAdminId).length;
      await escalateOverdueApprovalsBatch({ limit: 10, deadlineAt: Date.now() + 10_000 });
      const firstState = await state(overdue);
      const firstLogs = await logs(overdue);
      const firstNotifications = await notifications(overdue);
      expect(firstState.sla_escalated_at).not.toBeNull();
      expect(firstLogs).toHaveLength(1);
      expect(firstNotifications).toHaveLength(expectedRecipients);

      const rerun = await escalateOverdueApprovalsBatch({
        limit: 10,
        deadlineAt: Date.now() + 10_000,
      });
      expect(rerun.escalated).toBe(0);
      expect(rerun.scanned).toBe(0);
      expect(rerun.complete).toBe(true);
      expect(rerun.notified).toBe(0);
      expect(await state(overdue)).toEqual(firstState);
      expect(await logs(overdue)).toHaveLength(1);
      expect(await notifications(overdue)).toHaveLength(firstNotifications.length);

      // Dedupe also protects the notification row if a previous stamp were ever lost.
      const dedupeKey = `approval_escalated:${overdue}:${approverAdminId}`;
      const conflict = await db().query(
        `insert into notifications (user_id,type,title,dedupe_key)
       values ($1,'approval_escalated','duplicate',$2)
       on conflict (user_id,type,dedupe_key) where dedupe_key is not null do nothing
       returning id`,
        [approverAdminId, dedupeKey],
      );
      expect(conflict.rows).toHaveLength(0);
    },
  );

  it.runIf(hasDatabase)(
    "never clobbers a pending approval a human decided before the batch ran",
    async () => {
      const decidedConcurrently = await insertApproval({
        status: "pending",
        createdMinutesAgo: 320,
        requestedByProfileId: proposerAdminId,
      });
      await db().query(
        `update human_approvals
         set status='approved',decided_at=clock_timestamp()
         where id=$1`,
        [decidedConcurrently],
      );

      const result = await escalateOverdueApprovalsBatch({
        limit: 10,
        deadlineAt: Date.now() + 10_000,
      });
      expect(result.escalated).toBe(0);
      const row = await state(decidedConcurrently);
      expect(row.status).toBe("approved");
      expect(row.sla_escalated_at).toBeNull();
      expect(await logs(decidedConcurrently)).toHaveLength(0);
      expect(await notifications(decidedConcurrently)).toHaveLength(0);
    },
  );

  it.runIf(hasDatabase)("leaves rows inside the 4-hour window untouched", async () => {
    const fresh = await insertApproval({
      status: "pending",
      createdMinutesAgo: 30,
      requestedByProfileId: proposerAdminId,
    });
    const justInside = await insertApproval({ status: "pending", createdMinutesAgo: 239 });
    const result = await escalateOverdueApprovalsBatch({
      limit: 10,
      deadlineAt: Date.now() + 10_000,
    });
    expect(result.escalated).toBe(0);
    expect((await state(fresh)).sla_escalated_at).toBeNull();
    expect((await state(justInside)).sla_escalated_at).toBeNull();
  });
});
