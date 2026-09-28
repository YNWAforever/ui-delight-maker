import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/server/db/neon.server", () => ({
  transaction: async <T>(work: (db: Queryable) => Promise<T>): Promise<T> => {
    const client = await holder.pool!.connect();
    try {
      await client.query("begin");
      const result = await work({
        query: async <R>(sql: string, values: readonly unknown[] = []) => ({
          rows: (await client.query(sql, [...values])).rows as R[],
        }),
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
  query: async (sql: string, values: readonly unknown[] = [], db?: Queryable) =>
    (await (db ?? holder.pool!).query(sql, [...values])).rows,
  queryOne: async (sql: string, values: readonly unknown[] = [], db?: Queryable) =>
    (await (db ?? holder.pool!).query(sql, [...values])).rows[0] ?? null,
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { createImportService } from "@/server/imports/import-session.server";
import { productionImportHandler } from "@/server/imports/import-actions.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const salesId = "audit-import-sales-" + randomUUID();
const otherId = "audit-import-other-" + randomUUID();
const csId = "audit-import-cs-" + randomUUID();
const campaignId = randomUUID();
const namespace = "audit-t15-" + randomUUID();
const prefix = "T15 AUDIT " + randomUUID();
const sessionIds: string[] = [];
const db = () => holder.pool!;
function context(id = salesId, role: "sales" | "client_success" = "sales"): RequestAuthorization {
  return {
    session: { profile: { id, role, status: "active" } } as AppSession,
    actor: {
      profileId: id,
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
const service = createImportService({ handler: productionImportHandler });
async function preview(csvText: string) {
  const result = await service.previewImport(context(), {
    kind: "client",
    csvText,
    sourceNamespace: namespace,
  });
  sessionIds.push(result.sessionId);
  return result;
}
async function commit(prepared: { sessionId: string; previewHash: string }) {
  return service.commitImport(context(), {
    sessionId: prepared.sessionId,
    previewHash: prepared.previewHash,
    idempotencyKey: randomUUID(),
  });
}

describe("production CSV identity and row authorization on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 8 });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(db(), migrations);
    for (const id of [salesId, otherId]) {
      await db().query(
        "insert into profiles(id,email,name,role,status) values($1,$2,$1,'sales','active')",
        [id, id + "@audit.test"],
      );
    }
    await db().query(
      "insert into profiles(id,email,name,role,status) values($1,$2,$1,'client_success','active')",
      [csId, csId + "@audit.test"],
    );
    await db().query(
      "insert into campaigns(id,name,type,status,owner) values($1,$2,'client_event','active',$3)",
      [campaignId, prefix + " Event", csId],
    );
  }, 60_000);
  afterAll(async () => {
    if (!holder.pool) return;
    await db().query("drop trigger if exists audit_fail_import_contact on client_contacts");
    await db().query("drop function if exists audit_fail_import_contact()");
    await db().query(
      "delete from import_identity_keys where source_namespace=$1 or source_namespace like $1 || ':campaign:%'",
      [namespace],
    );
    await db().query("delete from import_sessions where id=any($1::uuid[])", [sessionIds]);
    await db().query("delete from clients where company_name like $1", [prefix + "%"]);
    await db().query("delete from leads where company_name like $1", [prefix + "%"]);
    await db().query("delete from campaigns where id=$1", [campaignId]);
    await db().query("delete from accounts where name like $1", [prefix + "%"]);
    await db().query("delete from profiles where id=any($1::text[])", [[salesId, otherId, csId]]);
    await db().end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)(
    "does not merge two distinct source IDs with the same company name",
    async () => {
      const company = prefix + " Same Name";
      const prepared = await preview(
        `external_id,company_name\nfirst,${company}\nsecond,${company}`,
      );
      expect(prepared.rows.map((row) => row.status)).toEqual([null, null]);
      const result = await commit(prepared);
      expect(result.rows.map((row) => row.status)).toEqual(["succeeded", "succeeded"]);
      const rows = (
        await db().query<{ id: string }>("select id from clients where company_name=$1", [company])
      ).rows;
      expect(rows).toHaveLength(2);
      expect(rows[0].id).not.toBe(rows[1].id);
    },
  );

  it.runIf(hasDatabase)(
    "concurrent sessions with one trusted external ID create one client",
    async () => {
      const company = prefix + " Concurrent";
      const csv = `external_id,company_name\nshared,${company}`;
      const [first, second] = await Promise.all([preview(csv), preview(csv)]);
      const [a, b] = await Promise.all([commit(first), commit(second)]);
      expect([a.rows[0].status, b.rows[0].status]).toEqual(["succeeded", "succeeded"]);
      expect(
        (await db().query("select id from clients where company_name=$1", [company])).rows,
      ).toHaveLength(1);
      expect(new Set([a.rows[0].id, b.rows[0].id]).size).toBe(1);
    },
  );

  it.runIf(hasDatabase)("an inactive preview actor cannot write a row", async () => {
    const company = prefix + " Inactive";
    const prepared = await preview(`external_id,company_name\ninactive,${company}`);
    await db().query("update profiles set status='deactivated' where id=$1", [salesId]);
    try {
      const result = await commit(prepared);
      expect(result.rows[0].status).toBe("forbidden");
      expect(
        (await db().query("select id from clients where company_name=$1", [company])).rows,
      ).toEqual([]);
    } finally {
      await db().query("update profiles set status='active' where id=$1", [salesId]);
    }
  });

  it.runIf(hasDatabase)(
    "a contact failure rolls its newly created client back with the row",
    async () => {
      await db().query(`create or replace function audit_fail_import_contact()
      returns trigger language plpgsql as $$ begin
        if new.email='fail@audit.test' then raise exception 'fixture contact failure'; end if;
        return new;
      end $$`);
      await db().query(`create trigger audit_fail_import_contact before insert on client_contacts
      for each row execute function audit_fail_import_contact()`);
      const company = prefix + " Contact Rollback";
      const prepared = await preview(
        `external_id,company_name,contact_name,contact_email\ncontact,${company},Test,fail@audit.test`,
      );
      const result = await commit(prepared);
      expect(result.rows[0].status).toBe("failed");
      expect(
        (await db().query("select id from clients where company_name=$1", [company])).rows,
      ).toEqual([]);
      await db().query("drop trigger audit_fail_import_contact on client_contacts");
      await db().query("drop function audit_fail_import_contact()");
    },
  );
  it.runIf(hasDatabase)(
    "reimport fills a Lead blank without resetting status, owner or score",
    async () => {
      const company = prefix + " Lead";
      const first = await service.previewImport(context(), {
        kind: "lead",
        sourceNamespace: namespace,
        csvText: `external_id,company_name,contact_email,owner_email\nlead-1,${company},lead@audit.test,${salesId}@audit.test`,
      });
      sessionIds.push(first.sessionId);
      expect(
        (
          await service.commitImport(context(), {
            sessionId: first.sessionId,
            previewHash: first.previewHash,
            idempotencyKey: randomUUID(),
          })
        ).rows[0].status,
      ).toBe("succeeded");
      await db().query("update leads set status='won',lead_score=91 where company_name=$1", [
        company,
      ]);
      const second = await service.previewImport(context(), {
        kind: "lead",
        sourceNamespace: namespace,
        csvText: `external_id,company_name,contact_email,contact_phone\nlead-1,${company},lead@audit.test,+85212345678`,
      });
      sessionIds.push(second.sessionId);
      const outcome = await service.commitImport(context(), {
        sessionId: second.sessionId,
        previewHash: second.previewHash,
        idempotencyKey: randomUUID(),
      });
      expect(outcome.rows[0]).toMatchObject({ status: "succeeded", action: "updated" });
      const lead = (
        await db().query(
          "select contact_phone,status,assigned_to,lead_score from leads where company_name=$1",
          [company],
        )
      ).rows[0];
      expect(lead).toMatchObject({
        contact_phone: "+85212345678",
        status: "won",
        assigned_to: salesId,
        lead_score: 91,
      });
    },
  );

  it.runIf(hasDatabase)(
    "event reimport uses the attendee external ID and does not duplicate members",
    async () => {
      const company = prefix + " Event Account";
      const accountId = randomUUID();
      await db().query("insert into accounts(id,name,account_owner) values($1,$2,$3)", [
        accountId,
        company,
        csId,
      ]);
      const csvText = `external_id,account_id,company_name,contact_name,email,attendee_status\nattendee-1,${accountId},${company},Pat,pat@audit.test,attended`;
      const first = await service.previewImport(context(csId, "client_success"), {
        kind: "event",
        campaignId,
        sourceNamespace: namespace,
        csvText,
      });
      sessionIds.push(first.sessionId);
      const firstResult = await service.commitImport(context(csId, "client_success"), {
        sessionId: first.sessionId,
        previewHash: first.previewHash,
        idempotencyKey: randomUUID(),
      });
      expect(firstResult.rows[0].status).toBe("succeeded");
      const again = await service.previewImport(context(csId, "client_success"), {
        kind: "event",
        campaignId,
        sourceNamespace: namespace,
        csvText,
      });
      sessionIds.push(again.sessionId);
      expect(again.rows[0].status).toBe("skipped");
      await service.commitImport(context(csId, "client_success"), {
        sessionId: again.sessionId,
        previewHash: again.previewHash,
        idempotencyKey: randomUUID(),
      });
      expect(
        (await db().query("select id from campaign_members where campaign_id=$1", [campaignId]))
          .rows,
      ).toHaveLength(1);
      const secondCampaignId = randomUUID();
      await db().query(
        "insert into campaigns(id,name,type,status,owner) values($1,$2,'client_event','active',$3)",
        [secondCampaignId, prefix + " Second Event", csId],
      );
      try {
        const contact = (
          await db().query<{ id: string }>("select id from account_contacts where account_id=$1", [
            accountId,
          ])
        ).rows[0];
        const secondCsv = `external_id,account_id,contact_id,company_name,contact_name,email,attendee_status\nattendee-1,${accountId},${contact.id},${company},Pat,pat@audit.test,attended`;
        const secondPreview = await service.previewImport(context(csId, "client_success"), {
          kind: "event",
          campaignId: secondCampaignId,
          sourceNamespace: namespace,
          csvText: secondCsv,
        });
        sessionIds.push(secondPreview.sessionId);
        const secondResult = await service.commitImport(context(csId, "client_success"), {
          sessionId: secondPreview.sessionId,
          previewHash: secondPreview.previewHash,
          idempotencyKey: randomUUID(),
        });
        expect(secondResult.rows[0].status).toBe("succeeded");
        expect(
          (
            await db().query("select id from campaign_members where campaign_id=$1", [
              secondCampaignId,
            ])
          ).rows,
        ).toHaveLength(1);
      } finally {
        await db().query("delete from campaigns where id=$1", [secondCampaignId]);
      }
    },
  );
});
