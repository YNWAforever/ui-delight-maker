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
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { getBusinessDateKey } from "@/lib/business-date";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { loadReportDataset, loadReportSummary } from "@/server/read-models/operations";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const actorId = `report-admin-${randomUUID()}`;
const context = (): RequestAuthorization => ({
  session: { profile: { id: actorId, role: "admin", status: "active" } } as AppSession,
  actor: {
    profileId: actorId,
    role: "admin",
    status: "active",
    managedDepartmentIds: [],
    managedTeamIds: [],
    directReportIds: [],
  },
  overrides: [],
  now: new Date(),
});

async function seedAccepted(
  currency: "HKD" | "USD",
  amount: string,
  acceptedAt: string | null,
  updatedAt: string,
): Promise<string> {
  const leadId = randomUUID();
  const quoteId = randomUUID();
  const versionId = randomUUID();
  await holder.pool!.query(
    "insert into leads (id,company_name,status,source) values ($1,'Currency Fixture','new','manual')",
    [leadId],
  );
  await holder.pool!.query(
    `insert into quotes
       (id,lead_id,status,total_value,currency,line_items,accepted_at,updated_at)
     values ($1,$2,'accepted',$3,$4,'[]'::jsonb,$5::timestamptz,$6::timestamptz)`,
    [quoteId, leadId, amount, currency, acceptedAt, updatedAt],
  );
  await holder.pool!.query(
    `insert into quote_versions (id,quote_id,version_number,reason,snapshot)
     values ($1,$2,1,'accepted',$3::jsonb)`,
    [
      versionId,
      quoteId,
      JSON.stringify({
        id: quoteId,
        total_value: amount,
        currency,
        accepted_at: acceptedAt,
      }),
    ],
  );
  await holder.pool!.query("update quotes set accepted_version_id=$2 where id=$1", [
    quoteId,
    versionId,
  ]);
  return quoteId;
}

function amountByCurrency(
  totals: Array<{ currency: string; amount: string }>,
  currency: string,
): number {
  return Number(totals.find((total) => total.currency === currency)?.amount ?? 0);
}

describe("accepted quote value by currency on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);
    await holder.pool.query(
      "insert into profiles (id,email,name,role,status) values ($1,$2,'Report Fixture','admin','active')",
      [actorId, `${actorId}@audit.invalid`],
    );
  }, 60_000);
  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)(
    "separates HKD and USD, uses immutable accepted date, and isolates legacy uncertainty",
    async () => {
      const before = await loadReportSummary({ range: "30d" }, context());
      const beforeRows = await loadReportDataset({ report: "revenue", range: "30d" }, context());
      const now = new Date();
      const recentAccepted = new Date(now.getTime() - 2 * 86_400_000).toISOString();
      const oldAccepted = new Date(now.getTime() - 60 * 86_400_000).toISOString();
      await seedAccepted("HKD", "100.25", recentAccepted, oldAccepted);
      await seedAccepted("USD", "100.00", recentAccepted, oldAccepted);
      const oldQuoteId = await seedAccepted("HKD", "500.00", oldAccepted, oldAccepted);
      // A later metadata touch must not make an old acceptance appear in this period.
      await holder.pool!.query("update quotes set updated_at=$2 where id=$1", [
        oldQuoteId,
        now.toISOString(),
      ]);
      await seedAccepted("HKD", "700.00", null, now.toISOString());

      const after = await loadReportSummary({ range: "30d" }, context());
      const afterRows = await loadReportDataset({ report: "revenue", range: "30d" }, context());
      expect(
        amountByCurrency(after.metrics.revenueTotals, "HKD") -
          amountByCurrency(before.metrics.revenueTotals, "HKD"),
      ).toBeCloseTo(100.25, 2);
      expect(
        amountByCurrency(after.metrics.revenueTotals, "USD") -
          amountByCurrency(before.metrics.revenueTotals, "USD"),
      ).toBeCloseTo(100, 2);
      expect(after.metrics.unverifiedAcceptedCount - before.metrics.unverifiedAcceptedCount).toBe(
        1,
      );
      const afterSum = afterRows.data.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      const beforeSum = beforeRows.data.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      expect(afterSum - beforeSum).toBeCloseTo(200.25, 2);
      expect(afterRows.data.some((row) => row.currency === "HKD")).toBe(true);
      expect(afterRows.data.some((row) => row.currency === "USD")).toBe(true);
    },
  );

  it.runIf(hasDatabase)("uses the Hong Kong midnight as the inclusive lower bound", async () => {
    const before = await loadReportSummary({ range: "7d" }, context());
    const startDay = getBusinessDateKey(new Date(Date.now() - 6 * 86_400_000));
    const startUtc = Date.parse(`${startDay}T00:00:00.000Z`) - 8 * 3_600_000;
    await seedAccepted("HKD", "7.00", new Date(startUtc).toISOString(), new Date().toISOString());
    await seedAccepted(
      "HKD",
      "5.00",
      new Date(startUtc - 1_000).toISOString(),
      new Date().toISOString(),
    );

    const after = await loadReportSummary({ range: "7d" }, context());
    expect(
      amountByCurrency(after.metrics.revenueTotals, "HKD") -
        amountByCurrency(before.metrics.revenueTotals, "HKD"),
    ).toBeCloseTo(7, 2);
  });
});
