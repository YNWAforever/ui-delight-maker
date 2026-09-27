import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import type { Queryable } from "@/server/db/neon.server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null, failAfterAudit: false }));
vi.mock("@/server/db/neon.server", () => ({
  transaction: async <T>(work: (db: Queryable) => Promise<T>): Promise<T> => {
    const client = await holder.pool!.connect();
    try {
      await client.query("begin");
      const result = await work({
        query: async <R>(text: string, values: readonly unknown[] = []) => {
          const response = await client.query(text, [...values]);
          if (holder.failAfterAudit && text.includes("insert into activity_logs")) {
            throw new Error("simulated failure after PostgreSQL audit insert");
          }
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
  query: async (text: string, values: readonly unknown[] = [], db?: { query: Pool["query"] }) =>
    (await (db ?? holder.pool!).query(text, [...values])).rows,
  queryOne: async (text: string, values: readonly unknown[] = [], db?: { query: Pool["query"] }) =>
    (await (db ?? holder.pool!).query(text, [...values])).rows[0] ?? null,
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { decideApprovalCommand } from "@/server/commands/approval-decision.server";
import { assignApproval } from "@/server/repositories/approvals";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const ownedIds: string[] = [];
const ownedRunIds: string[] = [];
const db = () => holder.pool!;
function context(profileId: string): RequestAuthorization {
  return {
    session: { profile: { id: profileId, role: "admin", status: "active" } } as AppSession,
    actor: {
      profileId,
      role: "admin",
      status: "active",
      managedDepartmentIds: [],
      managedTeamIds: [],
      directReportIds: [],
    },
    overrides: [],
    now: new Date(),
  };
}

describe("approval commands on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 4 });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
        path,
        sql: await readFile(path, "utf8"),
      })),
    );
    await runClientOpsMigrations(db(), migrations);
    for (const actorId of ["reviewer-a", "reviewer-b"]) {
      await db().query(
        "insert into profiles (id,email,name,role,status) values ($1,$2,$1,'admin','active') on conflict (id) do update set status='active'",
        [actorId, actorId + "@audit-approval.test"],
      );
    }
  }, 60_000);
  afterAll(async () => {
    if (holder.pool) {
      for (const id of ownedIds) {
        await db().query("delete from command_receipts where result->>'id'=$1", [id]);
        await db().query(
          "delete from activity_logs where object_type='approval' and object_id=$1",
          [id],
        );
        await db().query("delete from human_approvals where id=$1", [id]);
      }
      for (const id of ownedRunIds) await db().query("delete from agent_runs where id=$1", [id]);
      await db().query("delete from profiles where id=any($1::text[])", [
        ["reviewer-a", "reviewer-b"],
      ]);
      await holder.pool.end();
      holder.pool = null;
    }
  });

  async function pendingApproval() {
    const id = randomUUID();
    ownedIds.push(id);
    await db().query(
      "insert into human_approvals (id,approval_type,status) values ($1,'qualification_review','pending')",
      [id],
    );
    return id;
  }

  async function attachWaitingRun(approvalId: string) {
    const id = randomUUID();
    ownedRunIds.push(id);
    await db().query(
      "insert into agent_runs (id,agent_name,workflow_type,subject_id,status,human_review_required) values ($1,'audit-agent','qualify_lead',$2,'waiting_approval',true)",
      [id, approvalId],
    );
    await db().query("update human_approvals set agent_run_id=$2 where id=$1", [approvalId, id]);
    return id;
  }

  it.runIf(hasDatabase)(
    "replays the same key without changing timestamp, version or audit",
    async () => {
      const id = await pendingApproval();
      const input = {
        id,
        decision: "approved" as const,
        expectedVersion: 0,
        idempotencyKey: randomUUID(),
      };
      const first = await decideApprovalCommand(context("reviewer-a"), input);
      const retry = await decideApprovalCommand(context("reviewer-a"), input);
      expect(retry).toMatchObject({ id, status: "approved", row_version: first.row_version });
      expect(new Date(retry.decided_at!).toISOString()).toEqual(
        new Date(first.decided_at!).toISOString(),
      );
      expect(
        (
          await db().query(
            "select id from activity_logs where object_type='approval' and object_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (await db().query("select id from command_receipts where result->>'id'=$1", [id])).rows,
      ).toHaveLength(1);
    },
  );

  it.runIf(hasDatabase)("collapses concurrent identical retries to one audit", async () => {
    const id = await pendingApproval();
    const input = {
      id,
      decision: "approved" as const,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
    };
    const [first, second] = await Promise.all([
      decideApprovalCommand(context("reviewer-a"), input),
      decideApprovalCommand(context("reviewer-a"), input),
    ]);
    expect(first.id).toBe(id);
    expect(second.id).toBe(id);
    expect(first.row_version).toBe(1);
    expect(second.row_version).toBe(1);
    expect(
      (
        await db().query(
          "select id from activity_logs where object_type='approval' and object_id=$1",
          [id],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it.runIf(hasDatabase)("rejects changed payload and a new key after terminal state", async () => {
    const id = await pendingApproval();
    const idempotencyKey = randomUUID();
    const first = await decideApprovalCommand(context("reviewer-a"), {
      id,
      decision: "approved",
      notes: "one",
      expectedVersion: 0,
      idempotencyKey,
    });
    await expect(
      decideApprovalCommand(context("reviewer-a"), {
        id,
        decision: "rejected",
        notes: "two",
        expectedVersion: 0,
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      decideApprovalCommand(context("reviewer-a"), {
        id,
        decision: "rejected",
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const after = (
      await db().query("select status,row_version,decided_at from human_approvals where id=$1", [
        id,
      ])
    ).rows[0];
    expect(after.status).toBe("approved");
    expect(after.row_version).toBe(first.row_version);
    expect(after.decided_at.toISOString()).toBe(new Date(first.decided_at!).toISOString());
    expect(
      (
        await db().query(
          "select id from activity_logs where object_type='approval' and object_id=$1",
          [id],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it.runIf(hasDatabase)("keeps escalation open and allows a versioned final decision", async () => {
    const id = await pendingApproval();
    const escalated = await decideApprovalCommand(context("reviewer-a"), {
      id,
      decision: "escalated",
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
    });
    expect(escalated.status).toBe("escalated");
    expect(escalated.decided_at).toBeNull();
    expect(escalated.row_version).toBe(1);
    const final = await decideApprovalCommand(context("reviewer-a"), {
      id,
      decision: "approved",
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
    });
    expect(final.status).toBe("approved");
    expect(final.row_version).toBe(2);
  });

  it.runIf(hasDatabase)(
    "holds an agent run on escalation and releases it on final decision",
    async () => {
      const id = await pendingApproval();
      const runId = await attachWaitingRun(id);
      const escalated = await decideApprovalCommand(context("reviewer-a"), {
        id,
        decision: "escalated",
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
      });
      expect(escalated.row_version).toBe(2);
      expect(
        (
          await db().query("select status,human_review_required from agent_runs where id=$1", [
            runId,
          ])
        ).rows[0],
      ).toMatchObject({ status: "waiting_approval", human_review_required: true });
      await decideApprovalCommand(context("reviewer-a"), {
        id,
        decision: "rejected",
        expectedVersion: 2,
        idempotencyKey: randomUUID(),
      });
      expect(
        (
          await db().query("select status,human_review_required from agent_runs where id=$1", [
            runId,
          ])
        ).rows[0],
      ).toMatchObject({ status: "completed", human_review_required: false });
    },
  );

  it.runIf(hasDatabase)("serializes assignment against a versioned decision", async () => {
    const id = await pendingApproval();
    const outcomes = await Promise.allSettled([
      assignApproval({ id, assignedTo: "reviewer-b", expectedVersion: 0 }, context("reviewer-a")),
      decideApprovalCommand(context("reviewer-a"), {
        id,
        decision: "approved",
        expectedVersion: 0,
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const row = (
      await db().query("select status,row_version from human_approvals where id=$1", [id])
    ).rows[0];
    expect(row.row_version).toBe(1);
  });

  it.runIf(hasDatabase)("database trigger rejects a direct terminal overwrite", async () => {
    const id = await pendingApproval();
    await decideApprovalCommand(context("reviewer-a"), {
      id,
      decision: "approved",
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
    });
    await expect(
      db().query("update human_approvals set status='rejected' where id=$1", [id]),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it.runIf(hasDatabase)(
    "rolls back approval, audit and receipt after a real SQL write failure",
    async () => {
      const id = await pendingApproval();
      const runId = await attachWaitingRun(id);
      const idempotencyKey = randomUUID();
      holder.failAfterAudit = true;
      try {
        await expect(
          decideApprovalCommand(context("reviewer-a"), {
            id,
            decision: "approved",
            expectedVersion: 1,
            idempotencyKey,
          }),
        ).rejects.toThrow("simulated failure");
      } finally {
        holder.failAfterAudit = false;
      }
      const row = (
        await db().query("select status,row_version,decided_at from human_approvals where id=$1", [
          id,
        ])
      ).rows[0];
      expect(row).toMatchObject({ status: "pending", row_version: 1, decided_at: null });
      expect(
        (
          await db().query("select status,human_review_required from agent_runs where id=$1", [
            runId,
          ])
        ).rows[0],
      ).toMatchObject({ status: "waiting_approval", human_review_required: true });
      expect(
        (
          await db().query(
            "select id from activity_logs where object_type='approval' and object_id=$1",
            [id],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await db().query("select id from command_receipts where idempotency_key=$1", [
            idempotencyKey,
          ])
        ).rows,
      ).toEqual([]);
      const retried = await decideApprovalCommand(context("reviewer-a"), {
        id,
        decision: "approved",
        expectedVersion: 1,
        idempotencyKey,
      });
      expect(retried.status).toBe("approved");
      expect(
        (
          await db().query("select status,human_review_required from agent_runs where id=$1", [
            runId,
          ])
        ).rows[0],
      ).toMatchObject({ status: "completed", human_review_required: false });
    },
  );

  it.runIf(hasDatabase)(
    "allows only one terminal decision across two database connections",
    async () => {
      const id = await pendingApproval();
      const outcomes = await Promise.allSettled([
        decideApprovalCommand(context("reviewer-a"), {
          id,
          decision: "approved",
          expectedVersion: 0,
          idempotencyKey: randomUUID(),
        }),
        decideApprovalCommand(context("reviewer-b"), {
          id,
          decision: "rejected",
          expectedVersion: 0,
          idempotencyKey: randomUUID(),
        }),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
      const rows = await db().query("select status,decided_at from human_approvals where id=$1", [
        id,
      ]);
      expect(["approved", "rejected"]).toContain(rows.rows[0].status);
      expect(rows.rows[0].decided_at).not.toBeNull();
      const audit = await db().query(
        "select action from activity_logs where object_type='approval' and object_id=$1",
        [id],
      );
      expect(audit.rows).toHaveLength(1);
    },
  );
});
