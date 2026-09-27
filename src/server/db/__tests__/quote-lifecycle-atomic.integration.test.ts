import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient, types as pgTypes } from "pg";
import type { Queryable } from "@/server/db/neon.server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
import { createQuoteVersion } from "@/server/repositories/quote-versions";
import {
  acceptQuoteCommand,
  acceptQuoteInTransaction,
  approveAndIssueQuoteCommand,
  decideQuoteSendInTransaction,
  issueQuoteInTransaction,
  requestQuoteApprovalInTransaction,
} from "@/server/commands/quote-lifecycle.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const numericTypes = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    oid === 1700 ? Number : pgTypes.getTypeParser(oid, format)) as typeof pgTypes.getTypeParser,
};
const actorId = `lifecycle-admin-${randomUUID()}`;
const managerId = `lifecycle-manager-${randomUUID()}`;

function context(id: string, role: "admin" | "manager"): RequestAuthorization {
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

async function seedQuote(
  db: PoolClient | Pool,
  owner: string,
  status: "draft" | "pending_approval" | "approved" | "sent",
  total = 100,
) {
  const id = randomUUID();
  const leadId = randomUUID();
  await db.query(
    "insert into leads (id,company_name,status,source) values ($1,'Lifecycle Fixture','new','manual')",
    [leadId],
  );
  await db.query(
    `insert into quotes (id,lead_id,status,total_value,currency,line_items,created_by)
     values ($1,$2,$3,$4,'HKD','[]'::jsonb,$5)`,
    [id, leadId, status, total, owner],
  );
  return id;
}

async function seedApproval(db: PoolClient | Pool, quoteId: string, owner: string, status: string) {
  const quote = (await db.query("select * from quotes where id=$1", [quoteId])).rows[0];
  const result = await db.query(
    `insert into human_approvals
       (approval_type,status,requested_by,assigned_to,context_data)
     values ('quote_send',$1,$2,$2,$3::jsonb) returning id`,
    [
      status,
      owner,
      JSON.stringify({
        quote_id: quoteId,
        quote_number: quote.number,
        total_value: quote.total_value,
        currency: quote.currency,
      }),
    ],
  );
  return result.rows[0].id as string;
}

async function seedIssuedVersion(db: PoolClient | Pool, quoteId: string, total = 100) {
  const quote = (await db.query("select * from quotes where id=$1", [quoteId])).rows[0];
  const version = await createQuoteVersion(
    {
      quote_id: quoteId,
      reason: "issued",
      snapshot: { ...quote, total_value: total, line_items: [] },
      pdf_url: `/quotes/${quoteId}/pdf`,
      created_by: actorId,
    },
    db as unknown as Queryable,
  );
  await db.query("update quotes set issued_version_id=$2 where id=$1", [quoteId, version.id]);
  return version;
}

async function withRollback<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await holder.pool!.connect();
  await client.query("begin");
  try {
    return await work(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

/** Execute actual SQL, then fail at one chosen write boundary. */
function failAfter(client: PoolClient, pattern: RegExp): Queryable {
  return {
    query: async <T>(sql: string, values?: readonly unknown[]) => {
      const result = await client.query(sql, values ? [...values] : []);
      if (pattern.test(sql)) throw new Error("injected after real PostgreSQL write");
      return { rows: result.rows as T[] };
    },
  };
}

describe("atomic quote lifecycle on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({
      connectionString: process.env.DATABASE_TEST_URL,
      types: numericTypes,
    });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);
    await holder.pool.query(
      `insert into profiles (id,email,name,role,status) values
       ($1,$3,'Lifecycle Admin','admin','active'),
       ($2,$4,'Lifecycle Manager','manager','active')`,
      [actorId, managerId, `${actorId}@audit.invalid`, `${managerId}@audit.invalid`],
    );
  }, 60_000);
  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)(
    "rolls back the approval and notification after quote state write fails",
    async () => {
      const id = await seedQuote(holder.pool!, actorId, "draft");
      const client = await holder.pool!.connect();
      await client.query("begin");
      try {
        await expect(
          requestQuoteApprovalInTransaction(
            failAfter(client, /update quotes/i),
            context(actorId, "admin"),
            { id },
          ),
        ).rejects.toThrow("injected after real PostgreSQL write");
        await client.query("rollback");
      } finally {
        client.release();
      }
      const quote = (await holder.pool!.query("select status from quotes where id=$1", [id]))
        .rows[0];
      expect(quote.status).toBe("draft");
      const approvals = await holder.pool!.query(
        "select id from human_approvals where context_data->>'quote_id'=$1",
        [id],
      );
      expect(approvals.rowCount).toBe(0);
      const notifications = await holder.pool!.query(
        "select id from notifications where object_type='approval' and body like $1",
        [`%${id}%`],
      );
      expect(notifications.rowCount).toBe(0);
    },
  );

  it.runIf(hasDatabase)("manager can approve but cannot issue", async () => {
    await withRollback(async (client) => {
      const id = await seedQuote(client, managerId, "pending_approval");
      const approvalId = await seedApproval(client, id, managerId, "pending");
      const decided = await decideQuoteSendInTransaction(
        client as unknown as Queryable,
        context(managerId, "manager"),
        { id, approvalId, decision: "approved" },
      );
      expect(decided.quote.status).toBe("approved");
      await expect(
        issueQuoteInTransaction(client as unknown as Queryable, context(managerId, "manager"), {
          id,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const stored = (
        await client.query("select status,issued_version_id from quotes where id=$1", [id])
      ).rows[0];
      expect(stored).toMatchObject({ status: "approved", issued_version_id: null });
    });
  });

  it.runIf(hasDatabase)("rejects a pending quote and closes exactly its approval", async () => {
    await withRollback(async (client) => {
      const id = await seedQuote(client, managerId, "pending_approval");
      const approvalId = await seedApproval(client, id, managerId, "pending");
      const result = await decideQuoteSendInTransaction(
        client as unknown as Queryable,
        context(managerId, "manager"),
        { id, approvalId, decision: "rejected", notes: "Scope needs revision" },
      );
      expect(result.quote.status).toBe("rejected");
      expect(result.approval.status).toBe("rejected");
      await expect(
        decideQuoteSendInTransaction(
          client as unknown as Queryable,
          context(managerId, "manager"),
          {
            id,
            approvalId,
            decision: "approved",
          },
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  it.runIf(hasDatabase)("rejects an approval belonging to another quote", async () => {
    await withRollback(async (client) => {
      const firstId = await seedQuote(client, actorId, "pending_approval");
      const secondId = await seedQuote(client, actorId, "pending_approval");
      const wrongApprovalId = await seedApproval(client, secondId, actorId, "pending");
      await expect(
        decideQuoteSendInTransaction(client as unknown as Queryable, context(actorId, "admin"), {
          id: firstId,
          approvalId: wrongApprovalId,
          decision: "approved",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const quote = (await client.query("select status from quotes where id=$1", [firstId]))
        .rows[0];
      expect(quote.status).toBe("pending_approval");
    });
  });

  it.runIf(hasDatabase)("refuses draft issuance and orphaned legacy issued state", async () => {
    await withRollback(async (client) => {
      const draftId = await seedQuote(client, actorId, "draft");
      await expect(
        issueQuoteInTransaction(client as unknown as Queryable, context(actorId, "admin"), {
          id: draftId,
        }),
      ).rejects.toMatchObject({ code: "INVALID_STATE" });

      const orphanId = await seedQuote(client, actorId, "sent");
      await expect(
        issueQuoteInTransaction(client as unknown as Queryable, context(actorId, "admin"), {
          id: orphanId,
        }),
      ).rejects.toMatchObject({ code: "INVALID_STATE" });
    });
  });

  it.runIf(hasDatabase)(
    "quarantines an orphaned issued version instead of issuing twice",
    async () => {
      await withRollback(async (client) => {
        const id = await seedQuote(client, actorId, "approved");
        await seedApproval(client, id, actorId, "approved");
        const quote = (await client.query("select * from quotes where id=$1", [id])).rows[0];
        await createQuoteVersion(
          {
            quote_id: id,
            reason: "issued",
            snapshot: { ...quote, line_items: [] },
            pdf_url: `/quotes/${id}/pdf`,
            created_by: actorId,
          },
          client as unknown as Queryable,
        );
        await expect(
          issueQuoteInTransaction(client as unknown as Queryable, context(actorId, "admin"), {
            id,
          }),
        ).rejects.toMatchObject({ code: "INVALID_STATE" });
        const versions = await client.query(
          "select id from quote_versions where quote_id=$1 and reason='issued'",
          [id],
        );
        expect(versions.rowCount).toBe(1);
      });
    },
  );

  it.runIf(hasDatabase)("quarantines an orphaned accepted version", async () => {
    await withRollback(async (client) => {
      const id = await seedQuote(client, actorId, "sent");
      const issued = await seedIssuedVersion(client, id);
      await createQuoteVersion(
        {
          quote_id: id,
          reason: "accepted",
          snapshot: {
            ...(issued.snapshot as Record<string, unknown>),
            issued_version_id: issued.id,
          },
          pdf_url: issued.pdf_url,
          created_by: actorId,
        },
        client as unknown as Queryable,
      );
      await expect(
        acceptQuoteInTransaction(client as unknown as Queryable, context(actorId, "admin"), {
          id,
          issuedVersionId: issued.id,
          acceptanceEvidence: { reference: "customer-email:orphan-fixture" },
        }),
      ).rejects.toMatchObject({ code: "INVALID_STATE" });
      const sheets = await client.query("select id from job_sheets where quote_id=$1", [id]);
      expect(sheets.rowCount).toBe(0);
    });
  });

  it.runIf(hasDatabase)("rolls back a real issued version insert on failure", async () => {
    const id = await seedQuote(holder.pool!, actorId, "approved");
    await seedApproval(holder.pool!, id, actorId, "approved");
    const client = await holder.pool!.connect();
    await client.query("begin");
    try {
      await expect(
        issueQuoteInTransaction(
          failAfter(client, /insert into quote_versions/i),
          context(actorId, "admin"),
          {
            id,
          },
        ),
      ).rejects.toThrow("injected after real PostgreSQL write");
      await client.query("rollback");
    } finally {
      client.release();
    }
    const stored = (
      await holder.pool!.query("select status,issued_version_id from quotes where id=$1", [id])
    ).rows[0];
    expect(stored).toMatchObject({ status: "approved", issued_version_id: null });
    expect(
      (
        await holder.pool!.query(
          "select count(*)::int as n from quote_versions where quote_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it.runIf(hasDatabase)(
    "accepts immutable issued A rather than legacy live-row drift",
    async () => {
      await withRollback(async (client) => {
        const id = await seedQuote(client, actorId, "sent", 200);
        const issued = await seedIssuedVersion(client, id, 100);
        const input = {
          id,
          issuedVersionId: issued.id,
          acceptanceEvidence: { reference: "customer-email:fixture-42" },
          idempotencyKey: randomUUID(),
        };
        const first = await acceptQuoteInTransaction(
          client as unknown as Queryable,
          context(actorId, "admin"),
          input,
        );
        const retry = await acceptQuoteInTransaction(
          client as unknown as Queryable,
          context(actorId, "admin"),
          input,
        );
        expect(first.jobSheet.id).toBe(retry.jobSheet.id);
        expect(Number(first.jobSheet.total_amount)).toBe(100);
        expect(first.jobSheet.currency).toBe("HKD");
        expect(first.quote.accepted_version_id).toBeTruthy();
        const accepted = (
          await client.query("select snapshot from quote_versions where id=$1", [
            first.quote.accepted_version_id,
          ])
        ).rows[0];
        expect(accepted.snapshot.total_value).toBe(100);
        expect(accepted.snapshot.acceptance_evidence.reference).toBe("customer-email:fixture-42");
        await expect(
          acceptQuoteInTransaction(client as unknown as Queryable, context(actorId, "admin"), {
            ...input,
            idempotencyKey: randomUUID(),
            acceptanceEvidence: { reference: "different-evidence" },
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" });
      });
    },
  );

  it.runIf(hasDatabase)(
    "rolls back combined approval when issue authorization is denied",
    async () => {
      const id = await seedQuote(holder.pool!, managerId, "pending_approval");
      const approvalId = await seedApproval(holder.pool!, id, managerId, "pending");
      await expect(
        approveAndIssueQuoteCommand(context(managerId, "manager"), {
          id,
          approvalId,
          decision: "approved",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const quote = (await holder.pool!.query("select status from quotes where id=$1", [id]))
        .rows[0];
      const approval = (
        await holder.pool!.query("select status from human_approvals where id=$1", [approvalId])
      ).rows[0];
      expect(quote.status).toBe("pending_approval");
      expect(approval.status).toBe("pending");
    },
  );

  it.runIf(hasDatabase)(
    "issue-only override cannot approve through the combined command",
    async () => {
      const id = await seedQuote(holder.pool!, managerId, "pending_approval");
      const approvalId = await seedApproval(holder.pool!, id, managerId, "pending");
      await holder.pool!.query(
        `insert into permission_overrides
         (profile_id,capability,effect,resource_type,resource_id,reason,granted_by)
       values
         ($1,'quotes.approve','deny','quote',$2,'isolated regression',$3),
         ($1,'quotes.issue','allow','quote',$2,'isolated regression',$3)`,
        [managerId, id, actorId],
      );
      await expect(
        approveAndIssueQuoteCommand(context(managerId, "manager"), {
          id,
          approvalId,
          decision: "approved",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const quote = (await holder.pool!.query("select status from quotes where id=$1", [id]))
        .rows[0];
      const approval = (
        await holder.pool!.query("select status from human_approvals where id=$1", [approvalId])
      ).rows[0];
      expect(quote.status).toBe("pending_approval");
      expect(approval.status).toBe("pending");
    },
  );

  it.runIf(hasDatabase)(
    "rolls back quote status after an issued-version pointer write fails",
    async () => {
      const id = await seedQuote(holder.pool!, actorId, "approved");
      await seedApproval(holder.pool!, id, actorId, "approved");
      const client = await holder.pool!.connect();
      await client.query("begin");
      try {
        await expect(
          issueQuoteInTransaction(failAfter(client, /update quotes/i), context(actorId, "admin"), {
            id,
          }),
        ).rejects.toThrow("injected after real PostgreSQL write");
        await client.query("rollback");
      } finally {
        client.release();
      }
      const quote = (
        await holder.pool!.query("select status,issued_version_id from quotes where id=$1", [id])
      ).rows[0];
      expect(quote).toMatchObject({ status: "approved", issued_version_id: null });
      const versions = await holder.pool!.query("select id from quote_versions where quote_id=$1", [
        id,
      ]);
      expect(versions.rowCount).toBe(0);
    },
  );

  it.runIf(hasDatabase).each([
    ["accepted version", /insert into quote_versions/i],
    ["quote acceptance", /update quotes/i],
    ["Job Sheet creation", /insert into job_sheets/i],
  ])("rolls back %s after the real PostgreSQL write", async (_label, pattern) => {
    const id = await seedQuote(holder.pool!, actorId, "sent");
    const issued = await seedIssuedVersion(holder.pool!, id);
    const client = await holder.pool!.connect();
    await client.query("begin");
    try {
      await expect(
        acceptQuoteInTransaction(failAfter(client, pattern), context(actorId, "admin"), {
          id,
          issuedVersionId: issued.id,
          acceptanceEvidence: { reference: "customer-email:rollback-fixture" },
        }),
      ).rejects.toThrow("injected after real PostgreSQL write");
      await client.query("rollback");
    } finally {
      client.release();
    }
    const quote = (
      await holder.pool!.query(
        "select status,accepted_version_id,accepted_at from quotes where id=$1",
        [id],
      )
    ).rows[0];
    expect(quote).toMatchObject({
      status: "sent",
      accepted_version_id: null,
      accepted_at: null,
    });
    const accepted = await holder.pool!.query(
      "select id from quote_versions where quote_id=$1 and reason='accepted'",
      [id],
    );
    expect(accepted.rowCount).toBe(0);
    const sheets = await holder.pool!.query("select id from job_sheets where quote_id=$1", [id]);
    expect(sheets.rowCount).toBe(0);
  });

  it.runIf(hasDatabase)("serializes two accepted requests into one Job Sheet", async () => {
    const id = await seedQuote(holder.pool!, actorId, "sent");
    const issued = await seedIssuedVersion(holder.pool!, id);
    const input = {
      id,
      issuedVersionId: issued.id,
      acceptanceEvidence: { reference: "customer-email:concurrent-42" },
      idempotencyKey: randomUUID(),
    };
    const outcomes = await Promise.all([
      acceptQuoteCommand(context(actorId, "admin"), input),
      acceptQuoteCommand(context(actorId, "admin"), input),
    ]);
    expect(outcomes[0].jobSheet.id).toBe(outcomes[1].jobSheet.id);
    expect(
      (
        await holder.pool!.query("select count(*)::int as n from job_sheets where quote_id=$1", [
          id,
        ])
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await holder.pool!.query(
          "select count(*)::int as n from quote_versions where quote_id=$1 and reason='accepted'",
          [id],
        )
      ).rows[0].n,
    ).toBe(1);
  });
});
