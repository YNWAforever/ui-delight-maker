import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import type { Queryable } from "@/server/db/neon.server";
import { createReassignmentService } from "../reassignment.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const pool = hasDatabase
  ? new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 4 })
  : null;
const suffix = randomUUID();
const ids = {
  target: "t17-target-" + suffix,
  successor: "t17-successor-" + suffix,
  inactive: "t17-inactive-" + suffix,
  actor: "t17-actor-" + suffix,
};
const service = createReassignmentService({
  query: async <T>(sql: string, values: readonly unknown[] = [], db?: Queryable) =>
    (await (db ?? pool!).query(sql, [...values])).rows as T[],
  transaction: async <T>(work: (db: Queryable) => Promise<T>) => {
    const client = await pool!.connect();
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
});

describe("deactivation history on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!pool) return;
    await runClientOpsMigrations(
      pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
    for (const [kind, id] of Object.entries(ids)) {
      await pool.query(
        "insert into profiles(id,email,name,role,status) values($1,$2,$3,'sales',$4)",
        [
          id,
          kind + "-" + suffix + "@example.test",
          kind,
          kind === "inactive" ? "suspended" : "active",
        ],
      );
    }
    await pool.query(
      "insert into tasks(title,assigned_to,status) values('Open T17',$1,'open'),('Done T17',$1,'done')",
      [ids.target],
    );
    await pool.query(
      "insert into leads(company_name,assigned_to,status) values('Open T17',$1,'new'),('Won T17',$1,'won')",
      [ids.target],
    );
    await pool.query(
      "insert into campaigns(name,owner,status) values('Open T17',$1,'draft'),('Closed T17',$1,'completed')",
      [ids.target],
    );
    await pool.query(
      "insert into admin_audit_logs(actor_profile_id,target_type,target_id,action) values($1,'profile',$1,'historical.action')",
      [ids.target],
    );
  }, 60_000);
  afterAll(async () => {
    await pool?.end();
  });

  it.runIf(hasDatabase)(
    "retains closed assignments and audit identities while moving only open work",
    async () => {
      const inventory = await service.getReassignmentInventory(ids.target);
      for (const key of ["tasks.assigned_to", "leads.assigned_to", "campaigns.owner"]) {
        expect(inventory.buckets.find((bucket) => bucket.key === key)).toMatchObject({
          count: 1,
          historyCount: 1,
        });
      }
      expect(inventory.totalCount).toBe(3);
      expect(inventory.totalHistoryCount).toBe(3);
      const successors = {
        "tasks.assigned_to": ids.inactive,
        "leads.assigned_to": ids.inactive,
        "campaigns.owner": ids.inactive,
      };
      await expect(
        service.deactivateUserWithReassignment(
          {
            profileId: ids.target,
            reason: "Planned departure",
            reviewedInventory: inventory,
            successors,
          },
          ids.actor,
        ),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      expect(
        (await pool!.query("select status from profiles where id=$1", [ids.target])).rows[0].status,
      ).toBe("active");
      expect(
        (
          await pool!.query("select count(*)::int as n from tasks where assigned_to=$1", [
            ids.target,
          ])
        ).rows[0].n,
      ).toBe(2);

      const result = await service.deactivateUserWithReassignment(
        {
          profileId: ids.target,
          reason: "Planned departure",
          reviewedInventory: inventory,
          successors: {
            "tasks.assigned_to": ids.successor,
            "leads.assigned_to": ids.successor,
            "campaigns.owner": ids.successor,
          },
        },
        ids.actor,
      );
      expect(result.status).toBe("deactivated");
      for (const [table, column, openStatus, closedStatus] of [
        ["tasks", "assigned_to", "open", "done"],
        ["leads", "assigned_to", "new", "won"],
        ["campaigns", "owner", "draft", "completed"],
      ]) {
        const rows = (
          await pool!.query(
            "select status," +
              column +
              " as owner from " +
              table +
              " where " +
              column +
              " in ($1,$2) and status in ($3,$4)",
            [ids.target, ids.successor, openStatus, closedStatus],
          )
        ).rows;
        expect(rows.find((row) => row.status === openStatus)?.owner).toBe(ids.successor);
        expect(rows.find((row) => row.status === closedStatus)?.owner).toBe(ids.target);
      }
      const audit = (
        await pool!.query(
          "select actor_profile_id,action from admin_audit_logs where target_id=$1 order by created_at,id",
          [ids.target],
        )
      ).rows;
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ actor_profile_id: ids.target, action: "historical.action" }),
          expect.objectContaining({
            actor_profile_id: ids.actor,
            action: "profile.deactivated_with_reassignment",
          }),
        ]),
      );
    },
  );
});
