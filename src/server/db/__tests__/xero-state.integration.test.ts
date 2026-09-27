import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/server/db/neon.server", () => ({
  query: async <T>(sql: string, values: readonly unknown[] = []) =>
    (await holder.pool!.query(sql, [...values])).rows as T[],
  queryOne: async <T>(sql: string, values: readonly unknown[] = []) =>
    ((await holder.pool!.query(sql, [...values])).rows[0] as T | undefined) ?? null,
  transaction: async <T>(work: (db: { query: Pool["query"] }) => Promise<T>) => {
    const client = await holder.pool!.connect();
    try {
      await client.query("begin");
      const value = await work(client as never);
      await client.query("commit");
      return value;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { updateJobSheetXeroReference } from "@/server/repositories/job-sheets";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

async function seedPortion(): Promise<string> {
  const leadId = randomUUID();
  const quoteId = randomUUID();
  const versionId = randomUUID();
  const sheetId = randomUUID();
  const portionId = randomUUID();
  await holder.pool!.query(
    "insert into leads (id,company_name,status,source) values ($1,'Xero Fixture','new','manual')",
    [leadId],
  );
  await holder.pool!.query(
    `insert into quotes (id,lead_id,status,total_value,currency,line_items)
     values ($1,$2,'accepted',100,'HKD','[]'::jsonb)`,
    [quoteId, leadId],
  );
  await holder.pool!.query(
    `insert into quote_versions (id,quote_id,version_number,reason,snapshot)
     values ($1,$2,1,'accepted',$3::jsonb)`,
    [versionId, quoteId, JSON.stringify({ id: quoteId, total_value: 100, currency: "HKD" })],
  );
  await holder.pool!.query(
    `insert into job_sheets
       (id,number,quote_id,accepted_quote_version_id,total_amount,currency,status,locked_at)
     values ($1,$2,$3,$4,100,'HKD','accepted',now())`,
    [sheetId, `JS-XERO-${sheetId}`, quoteId, versionId],
  );
  await holder.pool!.query(
    `insert into job_sheet_portions
       (id,job_sheet_id,name,amount,currency,status)
     values ($1,$2,'Initial invoice',100,'HKD','planned')`,
    [portionId, sheetId],
  );
  return portionId;
}

describe("Xero state on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);
  }, 60_000);
  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)("saves an accounting note on an accepted Job Sheet", async () => {
    const portionId = await seedPortion();
    const saved = await updateJobSheetXeroReference({
      portion_id: portionId,
      xero_notes: "Need invoice later",
    });
    expect(saved.xero_notes).toBe("Need invoice later");
  });

  it.runIf(hasDatabase)("saving invoice fields alone does not confirm Xero entry", async () => {
    const portionId = await seedPortion();
    const saved = await updateJobSheetXeroReference({
      portion_id: portionId,
      xero_invoice_number: "INV-001",
      xero_invoice_date: "2026-09-27",
    });
    expect(saved.status).toBe("planned");
    const stored = (
      await holder.pool!.query(
        "select status,xero_invoice_number,xero_invoice_date from job_sheet_portions where id=$1",
        [portionId],
      )
    ).rows[0];
    expect(stored.status).toBe("planned");
    expect(stored.xero_invoice_number).toBe("INV-001");
    expect(stored.xero_invoice_date).toBeTruthy();
  });

  it.runIf(hasDatabase)("notes alone keep a planned portion out of the entered queue", async () => {
    const portionId = await seedPortion();
    const saved = await updateJobSheetXeroReference({
      portion_id: portionId,
      xero_notes: "Need invoice later",
    });
    expect(saved.status).toBe("planned");
    const stored = (
      await holder.pool!.query("select status,xero_notes from job_sheet_portions where id=$1", [
        portionId,
      ])
    ).rows[0];
    expect(stored).toMatchObject({ status: "planned", xero_notes: "Need invoice later" });
  });
});
