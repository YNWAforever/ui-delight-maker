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
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const actorId = `xero-accounting-${randomUUID()}`;
const salesId = `xero-sales-${randomUUID()}`;
const context = (): RequestAuthorization => ({
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
});

async function seedPortion(initialStatus: "planned" | "cancelled" = "planned"): Promise<string> {
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
     values ($1,$2,$3,$4,100,'HKD','accounting_review',null)`,
    [sheetId, `JS-XERO-${sheetId}`, quoteId, versionId],
  );
  await holder.pool!.query(
    `insert into job_sheet_portions
       (id,job_sheet_id,name,amount,currency,status)
     values ($1,$2,'Initial invoice',100,'HKD',$3)`,
    [portionId, sheetId, initialStatus],
  );
  await holder.pool!.query("update job_sheets set status='accepted', locked_at=now() where id=$1", [
    sheetId,
  ]);
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
    await holder.pool.query(
      "insert into profiles (id,email,name,role,status) values ($1,$2,'Xero Fixture','accounting','active')",
      [actorId, `${actorId}@audit.invalid`],
    );
    await holder.pool.query(
      "insert into profiles (id,email,name,role,status) values ($1,$2,'Xero Sales Fixture','sales','active')",
      [salesId, `${salesId}@audit.invalid`],
    );
  }, 60_000);
  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)("confirms entry only with invoice identity and date", async () => {
    const portionId = await seedPortion();
    const commands = (await import("@/server/commands/billing-portion.server")) as Record<
      string,
      unknown
    >;
    const confirm = commands.confirmXeroEntryCommand as
      | ((
          context: RequestAuthorization,
          input: {
            portionId: string;
            invoiceNumber: string;
            invoiceDate: string;
            expectedVersion: number;
            idempotencyKey: string;
          },
        ) => Promise<{ status: string; row_version: number }>)
      | undefined;
    const result = confirm
      ? await confirm(context(), {
          portionId,
          invoiceNumber: "INV-2026-001",
          invoiceDate: "2026-09-27",
          expectedVersion: 0,
          idempotencyKey: randomUUID(),
        })
      : null;
    expect(result?.status).toBe("entered_in_xero");
    expect(result?.row_version).toBe(1);
    const stored = (
      await holder.pool!.query(
        "select status,xero_invoice_number,xero_invoice_date from job_sheet_portions where id=$1",
        [portionId],
      )
    ).rows[0];
    expect(stored.status).toBe("entered_in_xero");
    expect(stored.xero_invoice_number).toBe("INV-2026-001");
    expect(stored.xero_invoice_date).toBeTruthy();
  });

  it.runIf(hasDatabase)("versioned note save preserves planned and cancelled states", async () => {
    const plannedId = await seedPortion();
    const cancelledId = await seedPortion("cancelled");
    const commands = (await import("@/server/commands/billing-portion.server")) as Record<
      string,
      unknown
    >;
    const save = commands.updateXeroNotesCommand as
      | ((
          context: RequestAuthorization,
          input: {
            portionId: string;
            notes: string;
            expectedVersion: number;
            idempotencyKey: string;
          },
        ) => Promise<{ status: string; xero_notes: string }>)
      | undefined;
    const planned = save
      ? await save(context(), {
          portionId: plannedId,
          notes: "Awaiting client PO",
          expectedVersion: 0,
          idempotencyKey: randomUUID(),
        })
      : null;
    const cancelled = save
      ? await save(context(), {
          portionId: cancelledId,
          notes: "Cancelled; do not invoice",
          expectedVersion: 0,
          idempotencyKey: randomUUID(),
        })
      : null;
    expect(planned).toMatchObject({ status: "planned", xero_notes: "Awaiting client PO" });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      xero_notes: "Cancelled; do not invoice",
    });
  });

  it.runIf(hasDatabase)("a reasoned correction can reopen a recorded Xero entry", async () => {
    const portionId = await seedPortion();
    const commands = (await import("@/server/commands/billing-portion.server")) as Record<
      string,
      unknown
    >;
    const confirm = commands.confirmXeroEntryCommand as (
      context: RequestAuthorization,
      input: {
        portionId: string;
        invoiceNumber: string;
        invoiceDate: string;
        expectedVersion: number;
        idempotencyKey: string;
      },
    ) => Promise<{ status: string; row_version: number }>;
    const recorded = await confirm(context(), {
      portionId,
      invoiceNumber: "INV-CORRECT",
      invoiceDate: "2026-09-27",
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
    });
    const correct = commands.correctXeroEntryCommand as
      | ((
          context: RequestAuthorization,
          input: {
            portionId: string;
            expectedVersion: number;
            idempotencyKey: string;
            reason: string;
            patch: { status: "planned" };
          },
        ) => Promise<{ status: string; row_version: number }>)
      | undefined;
    const result = correct
      ? await correct(context(), {
          portionId,
          expectedVersion: recorded.row_version,
          idempotencyKey: randomUUID(),
          reason: "Invoice voided in external system",
          patch: { status: "planned" },
        })
      : null;
    expect(result?.status).toBe("planned");
    expect(result?.row_version).toBe(2);
    const events = (
      await holder.pool!.query(
        "select action,note from job_sheet_activity where diff_data->>'portion_id'=$1 order by created_at",
        [portionId],
      )
    ).rows;
    expect(events.map((event) => event.action)).toEqual([
      "xero_entry_confirmed",
      "xero_entry_corrected",
    ]);
    expect(events[1].note).toBe("Invoice voided in external system");
  });

  it.runIf(hasDatabase)("note save cannot erase confirmed invoice evidence", async () => {
    const portionId = await seedPortion();
    const { confirmXeroEntryCommand, updateXeroNotesCommand } =
      await import("@/server/commands/billing-portion.server");
    const recorded = await confirmXeroEntryCommand(context(), {
      portionId,
      invoiceNumber: "INV-LOCKED",
      invoiceDate: "2026-09-27",
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
    });
    const saved = await updateXeroNotesCommand(context(), {
      portionId,
      notes: "Follow up with client",
      expectedVersion: recorded.row_version,
      idempotencyKey: randomUUID(),
    });
    expect(saved.status).toBe("entered_in_xero");
    expect(saved.xero_invoice_number).toBe("INV-LOCKED");
    expect(saved.xero_notes).toBe("Follow up with client");
  });

  it.runIf(hasDatabase)(
    "accepted Job Sheet commercial amount is immutable even through direct SQL",
    async () => {
      const portionId = await seedPortion();
      await expect(
        holder.pool!.query("update job_sheet_portions set amount=200 where id=$1", [portionId]),
      ).rejects.toMatchObject({ code: "23514" });
      const stored = (
        await holder.pool!.query("select amount from job_sheet_portions where id=$1", [portionId])
      ).rows[0];
      expect(Number(stored.amount)).toBe(100);
    },
  );

  it.runIf(hasDatabase)("rejects stale versions without changing notes or state", async () => {
    const portionId = await seedPortion();
    const { updateXeroNotesCommand } = await import("@/server/commands/billing-portion.server");
    await updateXeroNotesCommand(context(), {
      portionId,
      notes: "first",
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
    });
    await expect(
      updateXeroNotesCommand(context(), {
        portionId,
        notes: "stale second",
        expectedVersion: 0,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const row = (
      await holder.pool!.query(
        "select status,xero_notes,row_version from job_sheet_portions where id=$1",
        [portionId],
      )
    ).rows[0];
    expect(row).toMatchObject({ status: "planned", xero_notes: "first", row_version: 1 });
  });

  it.runIf(hasDatabase)("rejects incomplete confirmation and rolls back activity", async () => {
    const portionId = await seedPortion();
    const { confirmXeroEntryCommand } = await import("@/server/commands/billing-portion.server");
    await expect(
      confirmXeroEntryCommand(context(), {
        portionId,
        invoiceNumber: " ",
        invoiceDate: "2026-09-27",
        expectedVersion: 0,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const row = (
      await holder.pool!.query(
        "select status,row_version,xero_confirmed_at from job_sheet_portions where id=$1",
        [portionId],
      )
    ).rows[0];
    expect(row).toMatchObject({ status: "planned", row_version: 0, xero_confirmed_at: null });
    const count = (
      await holder.pool!.query(
        "select count(*)::int as count from job_sheet_activity where diff_data->>'portion_id'=$1",
        [portionId],
      )
    ).rows[0].count;
    expect(count).toBe(0);
  });

  it.runIf(hasDatabase)(
    "database rejects direct status flips without evidence or correction",
    async () => {
      const portionId = await seedPortion();
      await expect(
        holder.pool!.query("update job_sheet_portions set status='entered_in_xero' where id=$1", [
          portionId,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
      const { confirmXeroEntryCommand } = await import("@/server/commands/billing-portion.server");
      await confirmXeroEntryCommand(context(), {
        portionId,
        invoiceNumber: "INV-DB-GUARD",
        invoiceDate: "2026-09-27",
        expectedVersion: 0,
        idempotencyKey: randomUUID(),
      });
      await expect(
        holder.pool!.query("update job_sheet_portions set status='planned' where id=$1", [
          portionId,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
      const row = (
        await holder.pool!.query("select status,row_version from job_sheet_portions where id=$1", [
          portionId,
        ])
      ).rows[0];
      expect(row).toMatchObject({ status: "entered_in_xero", row_version: 1 });
    },
  );

  it.runIf(hasDatabase)("refreshes the actor role and honors a current row deny", async () => {
    const portionId = await seedPortion();
    const { updateXeroNotesCommand } = await import("@/server/commands/billing-portion.server");
    const staleAccountingContext = context();
    staleAccountingContext.actor.profileId = salesId;
    await expect(
      updateXeroNotesCommand(staleAccountingContext, {
        portionId,
        notes: "unauthorized",
        expectedVersion: 0,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const denyId = randomUUID();
    await holder.pool!.query(
      `insert into permission_overrides
       (id,profile_id,capability,effect,resource_type,resource_id,reason,granted_by)
       values ($1,$2,'job_sheets.update_billing','deny','job_sheet_portion',$3,
               'T08 isolated row-deny regression',$2)`,
      [denyId, actorId, portionId],
    );
    try {
      await expect(
        updateXeroNotesCommand(context(), {
          portionId,
          notes: "also unauthorized",
          expectedVersion: 0,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await holder.pool!.query("delete from permission_overrides where id=$1", [denyId]);
    }
    const row = (
      await holder.pool!.query(
        "select status,xero_notes,row_version from job_sheet_portions where id=$1",
        [portionId],
      )
    ).rows[0];
    expect(row).toMatchObject({ status: "planned", xero_notes: null, row_version: 0 });
  });

  it.runIf(hasDatabase)(
    "same-key confirmation replays once and rejects changed payload",
    async () => {
      const portionId = await seedPortion();
      const { confirmXeroEntryCommand } = await import("@/server/commands/billing-portion.server");
      const idempotencyKey = randomUUID();
      const input = {
        portionId,
        invoiceNumber: "INV-RETRY",
        invoiceDate: "2026-09-27",
        expectedVersion: 0,
        idempotencyKey,
      };
      const [first, replay] = await Promise.all([
        confirmXeroEntryCommand(context(), input),
        confirmXeroEntryCommand(context(), input),
      ]);
      expect(replay.id).toBe(first.id);
      expect(replay.row_version).toBe(1);
      expect(replay).not.toHaveProperty("owner_profile_id");
      expect(replay).not.toHaveProperty("job_sheet_status");
      await expect(
        confirmXeroEntryCommand(context(), { ...input, invoiceNumber: "INV-DIFFERENT" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const events = (
        await holder.pool!.query(
          "select count(*)::int as count from job_sheet_activity where action='xero_entry_confirmed' and diff_data->>'portion_id'=$1",
          [portionId],
        )
      ).rows[0].count;
      expect(events).toBe(1);
    },
  );
});
