import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient, types as pgTypes } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const holder = vi.hoisted(() => ({
  pool: null as Pool | null,
  client: null as PoolClient | null,
  session: null as AppSession | null,
}));
// Session and transport seams only; policy, ownership and SQL remain real.
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: async () => {
    if (!holder.session) throw new Error("No test session");
    return holder.session;
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = { validator: () => chain, handler: (fn: unknown) => fn };
    return chain;
  },
}));
vi.mock("@/server/db/neon.server", () => ({
  query: async <T>(sql: string, values: readonly unknown[] = [], db?: Queryable): Promise<T[]> =>
    (await (db ?? holder.client ?? holder.pool!).query(sql, [...values])).rows as T[],
  queryOne: async <T>(
    sql: string,
    values: readonly unknown[] = [],
    db?: Queryable,
  ): Promise<T | null> =>
    ((await (db ?? holder.client ?? holder.pool!).query(sql, [...values])).rows[0] as
      | T
      | undefined) ?? null,
  transaction: async <T>(work: (db: Queryable) => Promise<T>): Promise<T> => {
    if (holder.client) return work(holder.client as unknown as Queryable);
    const client = await holder.pool!.connect();
    try {
      await client.query("begin");
      const result = await work(client as unknown as Queryable);
      await client.query("commit");
      return result;
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
import {
  acceptJobSheet,
  getJobSheetOperationsRead,
  listJobSheetsPage,
  updateJobSheetHeader,
} from "@/server/repositories/job-sheets";
import {
  listAssignableProfiles,
  resolveAssignableProfile,
} from "@/server/repositories/assignable-profiles";
import { getJobSheetRead } from "@/server-functions/operations";
import { productionBulkHandler } from "@/server/operations/bulk-actions.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const actorId = "handoff-accounting-" + randomUUID();
const inactiveId = "handoff-inactive-" + randomUUID();
const pool = () => holder.pool!;
const db = () => holder.client ?? holder.pool!;
function context(): RequestAuthorization {
  return {
    session: { profile: { id: actorId, role: "accounting", status: "active" } } as AppSession,
    actor: {
      profileId: actorId,
      role: "accounting",
      status: "active",
      managedDepartmentIds: [],
      managedTeamIds: [],
      directReportIds: [],
    },
    overrides: [],
    now: new Date(),
  };
}

const numericTypes = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    oid === 1700 ? Number : pgTypes.getTypeParser(oid, format)) as typeof pgTypes.getTypeParser,
};

async function seedJobSheet(
  input: {
    amount?: number;
    poNumber?: string | null;
    accountingOwner?: string | null;
    companyName?: string;
  } = {},
) {
  const leadId = randomUUID();
  const quoteId = randomUUID();
  const versionId = randomUUID();
  const sheetId = randomUUID();
  await db().query(
    "insert into leads(id,company_name,status,source) values($1,$2,'new','manual')",
    [leadId, input.companyName ?? "Handoff Fixture"],
  );
  await db().query(
    "insert into quotes(id,number,lead_id,status,total_value,currency,line_items,created_by) values($1,$2,$3,'accepted',100,'HKD','[]'::jsonb,$4)",
    [quoteId, "Q-AUDIT-" + quoteId, leadId, actorId],
  );
  await db().query(
    "insert into quote_versions(id,quote_id,version_number,reason,snapshot,created_by) values($1,$2,1,'accepted',$4::jsonb,$3)",
    [versionId, quoteId, actorId, JSON.stringify({ total_value: 100, currency: "HKD" })],
  );
  await db().query(
    "insert into job_sheets(id,number,quote_id,accepted_quote_version_id,status,total_amount,currency,po_number,accounting_owner) values($1,$2,$3,$4,'accounting_review',$5,'HKD',$6,$7)",
    [
      sheetId,
      "JS-AUDIT-" + sheetId,
      quoteId,
      versionId,
      input.amount ?? 100,
      input.poNumber ?? null,
      input.accountingOwner ?? null,
    ],
  );
  await db().query(
    "insert into job_sheet_portions(job_sheet_id,name,amount,currency) values($1,'First portion',100,'HKD')",
    [sheetId],
  );
  return sheetId;
}

describe("Job Sheet handoff on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({
      connectionString: process.env.DATABASE_TEST_URL,
      types: numericTypes,
    });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(pool(), migrations);
    await pool().query(
      "insert into profiles(id,email,name,role,status) values($1,$2,'Handoff Accountant','accounting','active'),($3,$4,'Inactive Accountant','accounting','deactivated')",
      [actorId, actorId + "@audit.invalid", inactiveId, inactiveId + "@audit.invalid"],
    );
  }, 60_000);
  beforeEach(async () => {
    if (!hasDatabase) return;
    holder.client = await pool().connect();
    await holder.client.query("begin");
  });
  afterEach(async () => {
    if (!holder.client) return;
    await holder.client.query("rollback");
    holder.client.release();
    holder.client = null;
  });
  afterAll(async () => {
    if (!holder.pool) return;
    await pool().query("delete from profiles where id=any($1::text[])", [[actorId, inactiveId]]);
    await pool().end();
    holder.pool = null;
  });

  async function readAs(
    role:
      | "super_admin"
      | "admin"
      | "manager"
      | "sales"
      | "client_success"
      | "accounting"
      | "read_only",
    id: string,
  ) {
    const profileId = "billing-role-" + randomUUID();
    await db().query(
      "insert into profiles(id,email,name,role,status) values($1,$2,'Billing role fixture',$3,'active')",
      [profileId, profileId + "@audit.invalid", role],
    );
    if (role === "manager") {
      await db().query("update profiles set manager_profile_id=$1 where id=$2", [
        profileId,
        actorId,
      ]);
    }
    holder.session = { profile: { id: profileId, role, status: "active" } } as AppSession;
    return { profileId, read: await getJobSheetRead({ data: { id } }) };
  }

  it
    .runIf(hasDatabase)
    .each([
      "super_admin",
      "admin",
      "manager",
      "sales",
      "client_success",
      "accounting",
      "read_only",
    ] as const)("returns actual sheet and portion action capabilities for %s", async (role) => {
    const id = await seedJobSheet({ accountingOwner: actorId });
    const { read } = await readAs(role, id);
    const allowed = ["super_admin", "admin", "accounting"].includes(role);
    expect(read.canUpdateHeader).toBe(allowed);
    expect(read.canUpdateInvoiceByPortion[read.portions[0].id]).toBe(allowed);
  });

  it.runIf(hasDatabase)(
    "applies portion-scoped deny while the accounting sheet remains editable",
    async () => {
      const id = await seedJobSheet({ accountingOwner: actorId });
      const { profileId, read } = await readAs("accounting", id);
      await db().query(
        `insert into permission_overrides(profile_id,capability,effect,resource_type,resource_id,reason,granted_by)
      values($1,'job_sheets.update_billing','deny','job_sheet_portion',$2,'Isolated portion deny',$1)`,
        [profileId, read.portions[0].id],
      );
      const after = await getJobSheetRead({ data: { id } });
      expect(after.canUpdateHeader).toBe(true);
      expect(after.canUpdateInvoiceByPortion[read.portions[0].id]).toBe(false);
    },
  );

  it.runIf(hasDatabase)(
    "applies portion-scoped allow without granting read_only sheet planning",
    async () => {
      const id = await seedJobSheet({ accountingOwner: actorId });
      const { profileId, read } = await readAs("read_only", id);
      await db().query(
        `insert into permission_overrides(profile_id,capability,effect,resource_type,resource_id,reason,granted_by)
      values($1,'job_sheets.update_billing','allow','job_sheet_portion',$2,'Isolated portion allow',$3)`,
        [profileId, read.portions[0].id, actorId],
      );
      const after = await getJobSheetRead({ data: { id } });
      expect(after.canUpdateHeader).toBe(false);
      expect(after.canUpdateInvoiceByPortion[read.portions[0].id]).toBe(true);
    },
  );

  it.runIf(hasDatabase)("keeps an unowned sheet outside manager visibility", async () => {
    const id = await seedJobSheet();
    await expect(readAs("manager", id)).rejects.toThrow("outside your management scope");
  });

  it.runIf(hasDatabase)("ignores expired and revoked portion grants", async () => {
    const id = await seedJobSheet({ accountingOwner: actorId });
    const { profileId, read } = await readAs("read_only", id);
    await db().query(
      `insert into permission_overrides(profile_id,capability,effect,resource_type,resource_id,reason,granted_by,expires_at,revoked_at)
      values($1,'job_sheets.update_billing','allow','job_sheet_portion',$2,'Expired fixture',$3,now()-interval '1 day',null),
            ($1,'job_sheets.update_billing','allow','job_sheet_portion',$2,'Revoked fixture',$3,null,now())`,
      [profileId, read.portions[0].id, actorId],
    );
    const after = await getJobSheetRead({ data: { id } });
    expect(after.canUpdateInvoiceByPortion[read.portions[0].id]).toBe(false);
  });
  it.runIf(hasDatabase)(
    "records an explicit no-PO handoff and accepts a reconciled sheet",
    async () => {
      const id = await seedJobSheet();
      const repository = await import("@/server/repositories/job-sheets");
      const updateHeader = (
        repository as unknown as {
          updateJobSheetHeader?: (
            id: string,
            input: {
              accountingOwner: string;
              poNumber: string | null;
              noPoReason: string | null;
              clientOrder: string | null;
              billingInstructions: string | null;
            },
            actorId: string,
          ) => Promise<unknown>;
        }
      ).updateJobSheetHeader;
      expect(updateHeader).toBeTypeOf("function");
      await updateHeader!(
        id,
        {
          accountingOwner: actorId,
          poNumber: null,
          noPoReason: "The client does not issue purchase orders for this service.",
          clientOrder: null,
          billingInstructions: "Bill at the agreed milestone.",
        },
        actorId,
      );
      const accepted = await acceptJobSheet(id, { accepted_by: actorId });
      expect(accepted.status).toBe("accepted");
      expect(accepted.no_po_reason).toMatch(/does not issue purchase orders/);
      const activity = await db().query(
        "select action from job_sheet_activity where job_sheet_id=$1 order by created_at desc limit 1",
        [id],
      );
      expect(activity.rows[0].action).toBe("header_updated");
    },
  );

  it.runIf(hasDatabase)(
    "keeps a locked portion out of a mixed invoice-date bulk preview",
    async () => {
      const unlockedSheet = await seedJobSheet({ poNumber: "PO-OPEN", accountingOwner: actorId });
      const lockedSheet = await seedJobSheet({ poNumber: "PO-LOCKED", accountingOwner: actorId });
      await acceptJobSheet(lockedSheet, { accepted_by: actorId });
      const ids = (
        await db().query(
          "select id,job_sheet_id,row_version from job_sheet_portions where job_sheet_id=any($1::uuid[])",
          [[unlockedSheet, lockedSheet]],
        )
      ).rows as Array<{ id: string; job_sheet_id: string; row_version: number }>;
      const action = { type: "job_sheet.invoice_date", targetInvoiceDate: "2026-10-15" } as never;
      const open = ids.find((row) => row.job_sheet_id === unlockedSheet)!;
      const locked = ids.find((row) => row.job_sheet_id === lockedSheet)!;
      const openPreview = await productionBulkHandler.preview(context(), open.id, action);
      const lockedPreview = await productionBulkHandler.preview(context(), locked.id, action);
      expect(openPreview.eligible).toBe(true);
      expect(lockedPreview).toMatchObject({ eligible: false, status: "stale" });
      await productionBulkHandler.apply(
        context(),
        open.id,
        action,
        openPreview.version,
        db() as unknown as Queryable,
      );
      const after = await db().query(
        "select target_invoice_date::text as target_invoice_date from job_sheet_portions where id=$1",
        [open.id],
      );
      expect(after.rows[0].target_invoice_date).toBe("2026-10-15");
    },
  );

  it.runIf(hasDatabase)(
    "rejects a drifted Job Sheet amount against the accepted quote snapshot",
    async () => {
      const id = await seedJobSheet({
        amount: 101,
        poNumber: "PO-DRIFT",
        accountingOwner: actorId,
      });
      await expect(acceptJobSheet(id, { accepted_by: actorId })).rejects.toThrow(
        /accepted quote snapshot/i,
      );
      const row = (await db().query("select status from job_sheets where id=$1", [id])).rows[0];
      expect(row.status).toBe("accounting_review");
    },
  );

  it.runIf(hasDatabase)(
    "assigns only the open sheet from a mixed locked bulk selection",
    async () => {
      const openId = await seedJobSheet({ poNumber: "PO-OPEN", accountingOwner: actorId });
      const lockedId = await seedJobSheet({ poNumber: "PO-LOCKED", accountingOwner: actorId });
      await acceptJobSheet(lockedId, { accepted_by: actorId });
      const action = { type: "job_sheet.assign", profileId: actorId } as const;
      const openPreview = await productionBulkHandler.preview(context(), openId, action);
      const lockedPreview = await productionBulkHandler.preview(context(), lockedId, action);
      expect(openPreview.eligible).toBe(true);
      expect(lockedPreview).toMatchObject({ eligible: false, status: "stale" });
      await productionBulkHandler.apply(
        context(),
        openId,
        action,
        openPreview.version,
        db() as unknown as Queryable,
      );
      const rows = (
        await db().query("select id,accounting_owner from job_sheets where id=any($1::uuid[])", [
          [openId, lockedId],
        ])
      ).rows as Array<{ id: string; accounting_owner: string }>;
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.id === openId)?.accounting_owner).toBe(actorId);
      await expect(
        productionBulkHandler.apply(
          context(),
          lockedId,
          action,
          lockedPreview.version,
          db() as unknown as Queryable,
        ),
      ).rejects.toThrow(/locked|stale/i);
    },
  );

  it.runIf(hasDatabase)("offers only active accounting-eligible owners", async () => {
    const result = await listAssignableProfiles(
      { purpose: "job_sheet_owner", query: "Handoff", limit: 50 },
      context(),
    );
    expect(result.items.map((item) => item.id)).toContain(actorId);
    expect(result.items.map((item) => item.id)).not.toContain(inactiveId);
    expect(
      await resolveAssignableProfile({ purpose: "job_sheet_owner", id: inactiveId }, context()),
    ).toBeNull();
  });

  it.runIf(hasDatabase)("filters the page by company name and quote number", async () => {
    const first = await seedJobSheet({ companyName: "Harbour One" });
    await seedJobSheet({ companyName: "Harbour Two" });
    const quote = (
      await db().query(
        "select q.number from quotes q join job_sheets js on js.quote_id=q.id where js.id=$1",
        [first],
      )
    ).rows[0].number as string;
    const byCompany = await listJobSheetsPage(
      { company: "Harbour One", page: 1, limit: 50 } as never,
      context(),
    );
    expect(byCompany.items.map((row) => row.id)).toEqual([first]);
    const byQuote = await listJobSheetsPage(
      { quoteNumber: quote, page: 1, limit: 50 } as never,
      context(),
    );
    expect(byQuote.items.map((row) => row.id)).toEqual([first]);
  });

  it.runIf(hasDatabase)(
    "hydrates the handoff read and keeps accepted metadata editable",
    async () => {
      const id = await seedJobSheet({ poNumber: "PO-HYDRATE", accountingOwner: actorId });
      await updateJobSheetHeader(
        id,
        {
          accountingOwner: actorId,
          poNumber: "PO-HYDRATE",
          noPoReason: null,
          clientOrder: "CLIENT-ORDER",
          billingInstructions: "Milestone invoice",
        },
        actorId,
      );
      const before = await getJobSheetOperationsRead(id);
      expect(before.jobSheet.row_version).toBeGreaterThan(0);
      expect(before.quote?.versionNumber).toBe(1);
      expect(before.companyName).toBe("Handoff Fixture");
      expect(before.accountingOwnerName).toBe("Handoff Accountant");
      expect(before.portions[0]?.row_version).toBe(0);
      expect(before.portions[0]?.xero_confirmed_at).toBeNull();
      expect(before.portions[0]?.xero_corrected_at).toBeNull();
      await acceptJobSheet(id, { accepted_by: actorId });
      await expect(
        updateJobSheetHeader(
          id,
          {
            accountingOwner: actorId,
            poNumber: "PO-CHANGED",
            noPoReason: null,
            clientOrder: "CLIENT-ORDER",
            billingInstructions: "Milestone invoice",
          },
          actorId,
        ),
      ).rejects.toThrow(/locked/i);
      const after = await updateJobSheetHeader(
        id,
        {
          accountingOwner: actorId,
          poNumber: "PO-HYDRATE",
          noPoReason: null,
          clientOrder: "CLIENT-ORDER",
          billingInstructions: "Revised internal billing note",
        },
        actorId,
      );
      expect(after.special_billing_instructions).toBe("Revised internal billing note");
      expect(after.po_number).toBe("PO-HYDRATE");
    },
  );

  it.runIf(hasDatabase)(
    "filters owner, PO, status and Hong Kong creation date on PostgreSQL",
    async () => {
      const id = await seedJobSheet({ poNumber: "PO-T16-FILTER", accountingOwner: actorId });
      await seedJobSheet({ poNumber: "PO-OTHER", accountingOwner: null });
      const created = (
        await db().query(
          "select (created_at at time zone 'Asia/Hong_Kong')::date::text as local_day from job_sheets where id=$1",
          [id],
        )
      ).rows[0].local_day as string;
      const page = await listJobSheetsPage(
        {
          accountingOwner: actorId,
          po: "T16-FILTER",
          status: "accounting_review",
          createdFrom: created,
          createdTo: created,
          page: 1,
          limit: 50,
        },
        context(),
      );
      expect(page.items.map((row) => row.id)).toEqual([id]);
      expect(page.total).toBe(1);
    },
  );

  it.runIf(hasDatabase)("blocks direct SQL commercial header edits after acceptance", async () => {
    const id = await seedJobSheet({ poNumber: "PO-ORIGINAL", accountingOwner: actorId });
    await acceptJobSheet(id, { accepted_by: actorId });
    await expect(
      db().query("update job_sheets set po_number='PO-CHANGED' where id=$1", [id]),
    ).rejects.toThrow(/locked|accepted|commercial/i);
  });

  it.runIf(hasDatabase)("rejects an inactive accounting owner before acceptance", async () => {
    const id = await seedJobSheet({ poNumber: "PO-AUDIT", accountingOwner: inactiveId });
    await expect(acceptJobSheet(id, { accepted_by: actorId })).rejects.toThrow(/owner|active/i);
    const row = (await db().query("select status from job_sheets where id=$1", [id])).rows[0];
    expect(row.status).toBe("accounting_review");
  });

  it.runIf(hasDatabase)("rejects acceptance without a PO or documented exception", async () => {
    const id = await seedJobSheet({ accountingOwner: actorId });
    await expect(acceptJobSheet(id, { accepted_by: actorId })).rejects.toThrow(/PO|reason/i);
    const row = (await db().query("select status from job_sheets where id=$1", [id])).rows[0];
    expect(row.status).toBe("accounting_review");
  });
});
