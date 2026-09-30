import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const holder = vi.hoisted(() => ({ pool: null as Pool | null, queries: [] as string[] }));
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
  query: async (sql: string, values: readonly unknown[] = [], db?: Queryable) => {
    holder.queries.push(sql);
    return (await (db ?? holder.pool!).query(sql, [...values])).rows;
  },
  queryOne: async (sql: string, values: readonly unknown[] = [], db?: Queryable) => {
    holder.queries.push(sql);
    return (await (db ?? holder.pool!).query(sql, [...values])).rows[0] ?? null;
  },
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { createImportService } from "@/server/imports/import-session.server";
import type { ImportRow } from "@/lib/csv-import";
import type { ImportKind } from "@/server/imports/import-session.server";
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
    "previews 5,000 real Lead rows with bounded lookup queries and all mixed classifications",
    async () => {
      const headers = [
        "external_id",
        "company_name",
        "contact_email",
        "owner_email",
        "existing_id",
        "enquiry_text",
        "import_action",
      ];
      const rows = Array.from({ length: 5000 }, (_, i) => [
        "batch-" + i,
        prefix + " 中文 " + i,
        "batch-" + i + "@audit.test",
        salesId + "@audit.test",
        "",
        i === 0 ? '第一行\n第二行，"引用"' : "Synthetic import",
        "",
      ]);
      rows[4994][2] = "invalid-email";
      rows[4995][3] = "unavailable-owner@audit.test";
      rows[4996][6] = "skip";
      rows[4997] = [...rows[0]];
      rows[4998] = [...rows[0]];
      rows[4998][1] += " conflict";
      rows[4999][4] = randomUUID();
      const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
      const csvText =
        "\uFEFF" + [headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
      const offset = holder.queries.length;
      const prepared = await service.previewImport(context(), {
        kind: "lead",
        csvText,
        sourceNamespace: namespace,
      });
      sessionIds.push(prepared.sessionId);
      const lookupQueries = holder.queries
        .slice(offset)
        .filter((sql) => /\b(profiles|import_identity_keys|leads)\b/.test(sql));
      // Real SQL execution is recorded; no lookup result is fabricated.
      expect(lookupQueries.length).toBeLessThanOrEqual(3);
      expect(prepared.total).toBe(5000);
      const counts: Record<string, number> = {};
      for (const row of prepared.rows)
        counts[row.status ?? "ready"] = (counts[row.status ?? "ready"] ?? 0) + 1;
      expect(counts).toEqual({ ready: 4994, invalid: 2, skipped: 2, ambiguous: 1, stale: 1 });
      expect(prepared.rows.map((row) => row.recordIndex)).toEqual(
        Array.from({ length: 5000 }, (_, i) => i + 1),
      );
      expect(prepared.rows[1].sourceLine).toBe(4);
      expect(
        (await db().query("select id from leads where company_name like $1", [prefix + "%"])).rows,
      ).toHaveLength(0);
    },
  );

  it.runIf(hasDatabase).each(["lead", "client", "event"] as const)(
    "%s batch preview retains single-row SQL matching, status and target semantics",
    async (kind: ImportKind) => {
      const id = randomUUID(),
        memberId = randomUUID(),
        productId = randomUUID();
      const company = prefix + " Match " + kind,
        email = "Match-" + kind + "@audit.test";
      const table = kind === "lead" ? "leads" : kind === "client" ? "clients" : "accounts";
      if (kind === "lead")
        await db().query(
          "insert into leads(id,company_name,contact_email,assigned_to,row_version) values($1,$2,$3,$4,7)",
          [id, company, email, salesId],
        );
      if (kind === "client")
        await db().query(
          "insert into clients(id,company_name,account_owner,row_version) values($1,$2,$3,7)",
          [id, company, salesId],
        );
      if (kind === "event") {
        await db().query(
          "insert into accounts(id,name,account_owner,row_version) values($1,$2,$3,7)",
          [id, company, csId],
        );
        await db().query(
          "insert into campaign_members(id,campaign_id,raw_contact_name,raw_email) values($1,$2,'Synthetic', $3)",
          [memberId, campaignId, email],
        );
      }
      await db().query(
        "insert into products(id,name,billing_type,active) values($1,$2,'retainer',true)",
        [productId, prefix + " Product"],
      );
      const scope = kind === "event" ? namespace + ":campaign:" + campaignId : namespace;
      await db().query(
        "insert into import_identity_keys(source_namespace,resource_type,external_key,resource_id) values($1,$2,$3,$4)",
        [
          scope,
          kind === "event" ? "campaign_member" : kind,
          "match-" + kind,
          kind === "event" ? memberId : id,
        ],
      );
      const actor = kind === "event" ? context(csId, "client_success") : context();
      const input = {
        sourceNamespace: namespace,
        campaignId: kind === "event" ? campaignId : null,
      };
      const base: ImportRow = {
        company_name: company.toUpperCase(),
        contact_email: email.toUpperCase(),
        email: email.toUpperCase(),
        owner_email: (" " + salesId + "@AUDIT.TEST ").trim(),
        contact_name: "Synthetic",
      };
      const rows: ImportRow[] = [
        { ...base },
        { ...base, [kind === "event" ? "account_id" : "existing_id"]: id.toUpperCase() },
        { ...base, external_id: "match-" + kind },
        {
          ...base,
          external_id: "match-" + kind,
          [kind === "event" ? "account_id" : "existing_id"]: randomUUID(),
        },
        { ...base, [kind === "event" ? "account_id" : "existing_id"]: randomUUID() },
        { ...base, owner_email: "missing@audit.test" },
        { ...base, [kind === "event" ? "account_id" : "existing_id"]: "invalid" },
        { ...base, import_action: "skip" },
        { ...base, company_name: prefix + " New " + kind, external_id: "new-" + kind },
        { ...base, company_name: "", contact_name: "Synthetic" },
        { ...base, product_name: prefix + " Product", external_id: "product-" + kind },
        { ...base, product_name: "missing product", external_id: "missing-product-" + kind },
      ];
      try {
        const cached = await productionImportHandler.prepareBatch!(actor, kind, rows, input);
        const results = [];
        for (let i = 0; i < rows.length; i++) {
          const rowInput = { ...input, recordIndex: i + 1 };
          const single = await productionImportHandler.prepareRow(actor, kind, rows[i], rowInput);
          const batched = await cached(actor, kind, rows[i], rowInput);
          expect(batched).toEqual(single);
          results.push(batched);
        }
        expect(results.slice(0, 9).map((row) => row.status)).toEqual([
          "ambiguous",
          null,
          kind === "event" ? "skipped" : null,
          kind === "event" ? "skipped" : "ambiguous",
          "stale",
          "invalid",
          "invalid",
          "skipped",
          null,
        ]);
        expect(results[1]).toMatchObject({
          action: kind === "event" ? "attach" : "update",
          expectedVersion: 7,
          targetId: id.toUpperCase(),
        });
        expect(results[9].status).toBe(kind === "event" ? "ambiguous" : "invalid");
        if (kind === "client") {
          expect(results[10].status).toBeNull();
          expect(results[11].status).toBe("invalid");
        }
        // Namespace mappings and owner availability are reloaded for every request.
        const foreign = { ...input, sourceNamespace: namespace + ".foreign" };
        const foreignCache = await productionImportHandler.prepareBatch!(
          actor,
          kind,
          [rows[2]],
          foreign,
        );
        expect(
          (await foreignCache(actor, kind, rows[2], { ...foreign, recordIndex: 1 })).action,
        ).toBe("create");
      } finally {
        await db().query(
          "delete from import_identity_keys where source_namespace=$1 and external_key=$2",
          [scope, "match-" + kind],
        );
        if (kind === "event")
          await db().query("delete from campaign_members where id=$1", [memberId]);
        await db().query("delete from " + table + " where id=$1", [id]);
        await db().query("delete from products where id=$1", [productId]);
      }
    },
  );

  it.runIf(hasDatabase)(
    "a new preview and commit both recheck an owner changed after cached preview",
    async () => {
      const company = prefix + " Owner Changed";
      const values: ImportRow = {
        external_id: "owner-changed",
        company_name: company,
        contact_email: "owner@audit.test",
        owner_email: otherId + "@audit.test",
      };
      const input = { sourceNamespace: namespace, campaignId: null };
      const cached = await productionImportHandler.prepareBatch!(
        context(),
        "lead",
        [values],
        input,
      );
      expect(
        (await cached(context(), "lead", values, { ...input, recordIndex: 1 })).status,
      ).toBeNull();
      const prepared = await service.previewImport(context(), {
        kind: "lead",
        sourceNamespace: namespace,
        csvText:
          "external_id,company_name,contact_email,owner_email\nowner-changed," +
          company +
          ",owner@audit.test," +
          otherId +
          "@audit.test",
      });
      sessionIds.push(prepared.sessionId);
      await db().query("update profiles set status='deactivated' where id=$1", [otherId]);
      try {
        const refreshed = await productionImportHandler.prepareBatch!(
          context(),
          "lead",
          [values],
          input,
        );
        expect(
          (await refreshed(context(), "lead", values, { ...input, recordIndex: 1 })).status,
        ).toBe("invalid");
        const result = await commit(prepared);
        expect(result.rows[0].status).toBe("stale");
        expect(
          (await db().query("select id from leads where company_name=$1", [company])).rows,
        ).toHaveLength(0);
      } finally {
        await db().query("update profiles set status='active' where id=$1", [otherId]);
      }
    },
  );

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
