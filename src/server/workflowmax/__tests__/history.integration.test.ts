import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { importWfmHistory, type WfmSource } from "../importer.server";
import { WFM_PLAN } from "../plan.server";
import { reconcileWfm, type WfmSnapshot } from "../reconcile.server";
import { upsertWfmIdentity, WfmHistoryStore } from "../store.server";
import type { WfmObject } from "../http.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
let pool: Pool;
const namespace = `workflowmax:fixture-${randomUUID()}`;
const probeNamespace = namespace + "-identity";
let resources: Record<string, WfmObject[]>;
let firstSnapshot: WfmSnapshot;

function source(data = resources): WfmSource {
  return {
    sourceNamespace: namespace,
    async *list(path) {
      const step = WFM_PLAN.find((step) => step.path === path)!;
      for (const row of data[step.type]) yield row;
    },
  };
}
async function run(data = resources) {
  const store = await WfmHistoryStore.open(pool, namespace);
  return importWfmHistory({ source: source(data), store });
}

describe("WFM history on disposable PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 12 });
    await runClientOpsMigrations(
      pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
    const fixture = JSON.parse(
      await readFile("scripts/clientops/fixtures/wfm-history.json", "utf8"),
    );
    resources = fixture.resources;
    // Staff UUIDs are globally unique in WFM and the mapping has a text PK.
    // Randomize fixture UUIDs so CLI rehearsals can coexist with this test.
    const substitutions = new Map<string, string>();
    const serialized = JSON.stringify(resources).replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
      (key) => {
        if (!substitutions.has(key)) substitutions.set(key, randomUUID());
        return substitutions.get(key)!;
      },
    );
    resources = JSON.parse(serialized);
  }, 60_000);
  afterAll(async () => {
    if (!pool) return;
    for (const table of [
      "wfm_import_receipts",
      "wfm_invoice_line_items",
      "wfm_invoice_payments",
      "wfm_timesheet_lines",
      "wfm_timesheets",
      "wfm_invoices",
      "wfm_staff_map",
      "wfm_import_runs",
    ])
      await pool.query(`delete from ${table} where source_namespace=$1`, [namespace]);
    await pool.query(
      "delete from projects where id in(select resource_id from import_identity_keys where source_namespace=$1 and resource_type='project')",
      [namespace],
    );
    await pool.query(
      "delete from accounts where id in(select resource_id from import_identity_keys where source_namespace=$1 and resource_type='account')",
      [namespace],
    );
    await pool.query("delete from wfm_raw_objects where source_namespace=$1", [namespace]);
    await pool.query("delete from import_identity_keys where source_namespace=any($1::text[])", [
      [namespace, probeNamespace],
    ]);
    await pool.end();
  });

  it.runIf(hasDatabase)(
    "reserves one stable external identity under concurrent attempts and isolates orgs/types",
    async () => {
      const key = randomUUID();
      const identities = await Promise.all(
        Array.from({ length: 12 }, () => upsertWfmIdentity(pool, probeNamespace, "invoice", key)),
      );
      expect(new Set(identities.map((row) => row.resource_id)).size).toBe(1);
      expect(identities.filter((row) => row.created)).toHaveLength(1);
      const other = await upsertWfmIdentity(pool, namespace, "invoice", key);
      const type = await upsertWfmIdentity(pool, probeNamespace, "timesheet", key);
      expect(other.resource_id).not.toBe(identities[0].resource_id);
      expect(type.resource_id).not.toBe(identities[0].resource_id);
      await pool.query(
        "delete from import_identity_keys where source_namespace=$1 and external_key=$2",
        [namespace, key],
      );
    },
  );

  it.runIf(hasDatabase)(
    "imports full history twice with stable IDs and exact invoice/time totals",
    async () => {
      firstSnapshot = await run();
      const before = (
        await pool.query(
          "select resource_type,external_key,resource_id from import_identity_keys where source_namespace=$1 order by resource_type,external_key",
          [namespace],
        )
      ).rows;
      const second = await run();
      const after = (
        await pool.query(
          "select resource_type,external_key,resource_id from import_identity_keys where source_namespace=$1 order by resource_type,external_key",
          [namespace],
        )
      ).rows;
      expect(after).toEqual(before);
      const report = await reconcileWfm(pool, second);
      expect(report.ok).toBe(true);
      expect(report.invoiceTotals).toEqual([
        expect.objectContaining({ currency: "HKD", field: "total", wfm: "7150.1", ok: true }),
        expect.objectContaining({ currency: "HKD", field: "paid", wfm: "100.1", ok: true }),
      ]);
      expect(report.timesheets).toMatchObject({ wfmMinutes: "20", dbMinutes: "20", ok: true });
      const children = (
        await pool.query(
          "select (select count(*) from wfm_invoice_line_items where source_namespace=$1)::int as lines,(select count(*) from wfm_invoice_payments where source_namespace=$1)::int as payments",
          [namespace],
        )
      ).rows[0];
      expect(children).toEqual({ lines: 1, payments: 1 });
      const receipts = (
        await pool.query(
          "select action,count(*)::int as count from wfm_import_receipts where run_id=$1 group by action",
          [second.runId],
        )
      ).rows;
      expect(receipts).toEqual([{ action: "updated", count: 16 }]);
    },
  );

  it.runIf(hasDatabase)(
    "maps jobs to projects while leaving accepted quote and job-sheet evidence untouched",
    async () => {
      const project = (
        await pool.query(
          "select p.* from projects p join import_identity_keys k on k.resource_id=p.id where k.source_namespace=$1 and k.resource_type='project'",
          [namespace],
        )
      ).rows[0];
      expect(project).toMatchObject({
        name: "Historical job",
        status: "completed",
        quote_id: null,
      });
      const quoteId = (
        await pool.query(
          "select resource_id from import_identity_keys where source_namespace=$1 and resource_type='quote'",
          [namespace],
        )
      ).rows[0].resource_id;
      expect((await pool.query("select id from quotes where id=$1", [quoteId])).rows).toEqual([]);
      expect(
        (await pool.query("select id from job_sheets where quote_id=$1", [quoteId])).rows,
      ).toEqual([]);
    },
  );

  it.runIf(hasDatabase)(
    "replays migration 027 on populated history and keeps RLS server-only",
    async () => {
      await pool.query(await readFile(CLIENTOPS_MIGRATION_PATHS.at(-1)!, "utf8"));
      expect((await reconcileWfm(pool, firstSnapshot)).ok).toBe(true);
      const tables = (
        await pool.query(
          "select relname,relrowsecurity from pg_class where relname like 'wfm_%' and relkind='r'",
        )
      ).rows;
      expect(tables).toHaveLength(9);
      expect(tables.every((row) => row.relrowsecurity)).toBe(true);
      expect(
        (await pool.query("select * from pg_policies where tablename like 'wfm_%'")).rows,
      ).toEqual([]);
    },
  );

  it.runIf(hasDatabase)(
    "rolls back failed identities/raw/projections and records a durable failed receipt",
    async () => {
      const broken = structuredClone(resources);
      const badId = randomUUID();
      broken.invoice = [{ ...broken.invoice[0], uuid: badId, dueDate: "2025-02-30" }];
      await expect(run(broken)).rejects.toThrow("invoice");
      expect(
        (
          await pool.query(
            "select * from import_identity_keys where source_namespace=$1 and external_key=$2",
            [namespace, badId],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await pool.query(
            "select * from wfm_raw_objects where source_namespace=$1 and external_key=$2",
            [namespace, badId],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await pool.query(
            "select r.status,r.action,x.state from wfm_import_receipts r join wfm_import_runs x on x.id=r.run_id where r.source_namespace=$1 and r.external_key=$2",
            [namespace, badId],
          )
        ).rows,
      ).toEqual([{ status: "failed", action: "failed", state: "failed" }]);
      await run();
    },
  );

  it.runIf(hasDatabase)(
    "detects exact money mismatches, honors thresholds, and rejects partial snapshots",
    async () => {
      await pool.query("update wfm_invoices set total=total+0.01 where source_namespace=$1", [
        namespace,
      ]);
      const mismatch = await reconcileWfm(pool, firstSnapshot);
      expect(mismatch.ok).toBe(false);
      expect(mismatch.invoiceTotals.find((row) => row.field === "total")).toMatchObject({
        difference: "0.01",
        ok: false,
      });
      expect((await reconcileWfm(pool, firstSnapshot, { amount: "0.01" })).ok).toBe(true);
      await expect(reconcileWfm(pool, { ...firstSnapshot, mode: "incremental" })).rejects.toThrow(
        "complete full-source",
      );
      await expect(reconcileWfm(pool, { ...firstSnapshot, complete: false })).rejects.toThrow();
      await expect(reconcileWfm(pool, firstSnapshot, { hours: "-1" })).rejects.toThrow(
        "nonnegative",
      );
      await run();
    },
  );

  it.runIf(hasDatabase)(
    "fails equal-count UUID substitutions and missing totals rather than reporting false success",
    async () => {
      const changed = structuredClone(firstSnapshot);
      changed.resources.task = [randomUUID()];
      const report = await reconcileWfm(pool, changed);
      expect(report.ok).toBe(false);
      expect(report.counts.find((row) => row.resource === "task")).toMatchObject({
        wfm: 1,
        db: 1,
        missingCount: 1,
        extraCount: 1,
        ok: false,
      });
      await pool.query("update wfm_invoices set paid=null where source_namespace=$1", [namespace]);
      expect((await reconcileWfm(pool, firstSnapshot, { amount: "999999" })).ok).toBe(false);
      await run();
    },
  );
});
