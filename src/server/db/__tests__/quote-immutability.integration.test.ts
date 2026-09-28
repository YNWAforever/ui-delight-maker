import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import type { Queryable } from "@/server/db/neon.server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/server/db/neon.server", () => ({
  query: async <T>(text: string, values: readonly unknown[] = [], db?: Queryable): Promise<T[]> =>
    (await (db ?? holder.pool!).query(text, [...values])).rows as T[],
  queryOne: async <T>(
    text: string,
    values: readonly unknown[] = [],
    db?: Queryable,
  ): Promise<T | null> =>
    ((await (db ?? holder.pool!).query(text, [...values])).rows[0] as T | undefined) ?? null,
  transaction: async <T>(work: (db: Queryable) => Promise<T>): Promise<T> => {
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
import { updateQuote } from "@/server/repositories/quotes";
import { createQuoteVersion } from "@/server/repositories/quote-versions";
import { createQuoteRevisionInTransaction } from "@/server/commands/quote-revision.server";
import { resolveQuotePdfSource } from "@/lib/quote-pdf-source";
import { inspectQuoteIntegrity } from "@/server/repositories/quote-integrity";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";
import type { Quote } from "@/lib/types";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
let client: PoolClient;
let quoteId: string;

async function quote(status: string = "draft", total = 100) {
  const leadId = randomUUID();
  quoteId = randomUUID();
  await client.query(
    "insert into leads (id,company_name,status,source) values ($1,'Immutable Quote Fixture','new','manual')",
    [leadId],
  );
  await client.query(
    "insert into quotes (id,lead_id,status,total_value,currency,line_items,cover_text) values ($1,$2,$3,$4,'HKD','[]'::jsonb,'Original')",
    [quoteId, leadId, status, total],
  );
  return quoteId;
}

async function version(id: string, reason: "issued" | "accepted" = "issued") {
  const source = (await client.query("select * from quotes where id=$1", [id])).rows[0];
  return createQuoteVersion(
    {
      quote_id: id,
      reason,
      snapshot: {
        ...source,
        number: "Q-IMMUTABLE",
        total_value: 100,
        currency: "HKD",
        line_items: [],
        cover_text: "Original",
      },
      pdf_url: `/quotes/${id}/pdf`,
    },
    client as unknown as Queryable,
  );
}

/** A rejected PostgreSQL statement aborts a transaction until its savepoint is rolled back. */
async function expectBlocked(action: () => Promise<unknown>) {
  await client.query("savepoint protected_write");
  try {
    await expect(action()).rejects.toThrow();
  } finally {
    await client.query("rollback to savepoint protected_write");
  }
}

describe("quote commercial and version immutability on isolated PostgreSQL", () => {
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
  beforeEach(async () => {
    if (!hasDatabase) return;
    client = await holder.pool!.connect();
    await client.query("begin");
  });
  afterEach(async () => {
    if (!hasDatabase) return;
    await client.query("rollback");
    client.release();
  });

  it.runIf(hasDatabase)(
    "rejects repository commercial edits after approval and after issue",
    async () => {
      for (const status of ["approved", "sent", "viewed", "accepted"]) {
        const id = await quote(status);
        await expectBlocked(() =>
          updateQuote(id, { total_value: 999 }, client as unknown as Queryable),
        );
        const stored = (await client.query("select total_value from quotes where id=$1", [id]))
          .rows[0];
        expect(Number(stored.total_value)).toBe(100);
      }
    },
  );

  it.runIf(hasDatabase)(
    "rejects a commercial edit in the same statement that issues a draft",
    async () => {
      const id = await quote("draft");
      await expectBlocked(() =>
        client.query("update quotes set status='sent',total_value=999 where id=$1", [id]),
      );
      const stored = (await client.query("select status,total_value from quotes where id=$1", [id]))
        .rows[0];
      expect(stored.status).toBe("draft");
      expect(Number(stored.total_value)).toBe(100);
    },
  );

  it.runIf(hasDatabase)("rejects direct SQL commercial edits on an issued quote", async () => {
    const id = await quote("sent");
    await expectBlocked(() =>
      client.query(
        "update quotes set currency='USD',line_items='[{\"service\":\"Changed\"}]'::jsonb where id=$1",
        [id],
      ),
    );
    const stored = (await client.query("select currency,line_items from quotes where id=$1", [id]))
      .rows[0];
    expect(stored.currency).toBe("HKD");
    expect(stored.line_items).toEqual([]);
  });

  it.runIf(hasDatabase)("rejects direct normalized line-item edits after issue", async () => {
    const id = await quote("sent");
    await expectBlocked(() =>
      client.query(
        "insert into quote_line_items (quote_id,service,description,qty,unit_price) values ($1,'Changed','',1,999)",
        [id],
      ),
    );
    expect(
      (await client.query("select id from quote_line_items where quote_id=$1", [id])).rows,
    ).toEqual([]);
  });

  it.runIf(hasDatabase)(
    "freezes existing line items, including updates, deletes and reparenting",
    async () => {
      const id = await quote("draft");
      const lineId = randomUUID();
      await client.query(
        "insert into quote_line_items (id,quote_id,service,description,qty,unit_price) values ($1,$2,'Original','',1,100)",
        [lineId, id],
      );
      await client.query("update quotes set status='sent' where id=$1", [id]);
      const otherId = await quote("draft");
      await expectBlocked(() =>
        client.query("update quote_line_items set unit_price=999 where id=$1", [lineId]),
      );
      await expectBlocked(() => client.query("delete from quote_line_items where id=$1", [lineId]));
      await expectBlocked(() =>
        client.query("update quote_line_items set quote_id=$2 where id=$1", [lineId, otherId]),
      );
      const stored = (
        await client.query("select quote_id,unit_price from quote_line_items where id=$1", [lineId])
      ).rows[0];
      expect(stored.quote_id).toBe(id);
      expect(Number(stored.unit_price)).toBe(100);
    },
  );

  it.runIf(hasDatabase)("allows draft edits and lifecycle-only metadata changes", async () => {
    const id = await quote("draft");
    await updateQuote(
      id,
      { total_value: 200, cover_text: "Draft revision" },
      client as unknown as Queryable,
    );
    await client.query("update quotes set status='sent',pdf_url='/quotes/issued.pdf' where id=$1", [
      id,
    ]);
    await client.query("update quotes set status='viewed' where id=$1", [id]);
    const stored = (
      await client.query("select status,total_value,cover_text,pdf_url from quotes where id=$1", [
        id,
      ])
    ).rows[0];
    expect(stored).toMatchObject({
      status: "viewed",
      cover_text: "Draft revision",
      pdf_url: "/quotes/issued.pdf",
    });
    expect(Number(stored.total_value)).toBe(200);
  });

  it.runIf(hasDatabase)(
    "creates a separate revision without drifting issued version A",
    async () => {
      const id = await quote("sent");
      const actorId = `revision-${randomUUID()}`;
      await client.query(
        "insert into profiles (id,email,name,role,status) values ($1,$2,'Revision Reviewer','admin','active')",
        [actorId, `${actorId}@audit.test`],
      );
      const issued = await version(id);
      const hashA = createHash("sha256").update(JSON.stringify(issued.snapshot)).digest("hex");
      await client.query("update quotes set issued_version_id=$2 where id=$1", [id, issued.id]);
      const context: RequestAuthorization = {
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
      };
      const input = {
        id,
        baseVersionId: issued.id,
        reason: "revised" as const,
        patch: {
          line_items: [
            { id: "new-line", service: "Revised service", description: "", qty: 2, unit_price: 80 },
          ],
          total_value: 160,
        },
        idempotencyKey: randomUUID(),
      };
      const first = await createQuoteRevisionInTransaction(
        client as unknown as Queryable,
        context,
        input,
      );
      const retry = await createQuoteRevisionInTransaction(
        client as unknown as Queryable,
        context,
        input,
      );
      expect(first.quote.id).not.toBe(id);
      expect(first.quote.status).toBe("revised");
      expect(first.quote.parent_quote_id).toBe(id);
      expect(retry.quote.id).toBe(first.quote.id);
      expect(first.version.reason).toBe("revised");
      expect(first.version.snapshot).toMatchObject({
        id,
        base_version_id: issued.id,
        revision_quote_id: first.quote.id,
      });
      expect(
        (await client.query("select count(*)::int as n from quotes where parent_quote_id=$1", [id]))
          .rows[0].n,
      ).toBe(1);
      const parent = (await client.query("select * from quotes where id=$1", [id]))
        .rows[0] as Quote;
      const versions = (
        await client.query(
          "select * from quote_versions where quote_id=$1 order by version_number",
          [id],
        )
      ).rows;
      expect(parent.issued_version_id).toBe(issued.id);
      expect(resolveQuotePdfSource(parent, versions).sourceVersion?.id).toBe(issued.id);
      const storedA = versions.find((entry) => entry.id === issued.id);
      expect(createHash("sha256").update(JSON.stringify(storedA.snapshot)).digest("hex")).toBe(
        hashA,
      );
    },
  );

  it.runIf(hasDatabase)(
    "reports legacy missing versions and drift without changing rows",
    async () => {
      const missing = await quote("sent");
      const mismatched = await quote("sent");
      const issued = await version(mismatched);
      await client.query("update quotes set issued_version_id=$2 where id=$1", [
        mismatched,
        issued.id,
      ]);
      const report = await inspectQuoteIntegrity(
        { ids: [missing, mismatched] },
        client as unknown as Queryable,
      );
      expect(report.scanned).toBe(2);
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ quoteId: missing, issues: ["missing_version_reference"] }),
        ]),
      );
      expect(report.findings.some((item) => item.quoteId === mismatched)).toBe(false);
      expect(
        (await client.query("select issued_version_id from quotes where id=$1", [mismatched]))
          .rows[0].issued_version_id,
      ).toBe(issued.id);

      // The row and immutable version were already inconsistent when loaded.
      const drifted = await quote("sent", 200);
      const driftVersion = await version(drifted);
      await client.query("update quotes set issued_version_id=$2 where id=$1", [
        drifted,
        driftVersion.id,
      ]);
      const driftReport = await inspectQuoteIntegrity(
        { ids: [drifted] },
        client as unknown as Queryable,
      );
      expect(driftReport.findings[0]).toMatchObject({
        quoteId: drifted,
        issues: ["commercial_drift"],
      });
      expect(
        (await client.query("select total_value from quotes where id=$1", [drifted])).rows[0]
          .total_value,
      ).toBe("200.00");
      await expectBlocked(() =>
        client.query("update quotes set total_value=999 where id=$1", [drifted]),
      );
    },
  );

  it.runIf(hasDatabase)(
    "flags an accepted quote pointing at an issued rather than accepted version",
    async () => {
      const id = await quote("accepted");
      const issued = await version(id);
      await client.query("update quotes set accepted_version_id=$2 where id=$1", [id, issued.id]);
      const report = await inspectQuoteIntegrity({ ids: [id] }, client as unknown as Queryable);
      expect(report.findings[0]).toMatchObject({
        quoteId: id,
        issues: ["wrong_version_reason"],
      });
      expect(
        (await client.query("select accepted_version_id from quotes where id=$1", [id])).rows[0]
          .accepted_version_id,
      ).toBe(issued.id);
    },
  );

  it.runIf(hasDatabase)("keeps issued version snapshots immutable and undeletable", async () => {
    const id = await quote("sent");
    const issued = await version(id);
    await client.query("update quotes set issued_version_id=$2 where id=$1", [id, issued.id]);
    await expectBlocked(() =>
      client.query("update quote_versions set snapshot='{}'::jsonb where id=$1", [issued.id]),
    );
    await expectBlocked(() => client.query("delete from quote_versions where id=$1", [issued.id]));
    const stored = (
      await client.query("select snapshot from quote_versions where id=$1", [issued.id])
    ).rows[0];
    expect(stored.snapshot.total_value).toBe(100);
  });
});
