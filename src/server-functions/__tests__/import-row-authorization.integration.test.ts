import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppSession } from "@/lib/auth/neon-auth.server";
import type { PermissionOverride, UserRole } from "@/lib/admin/types";
import {
  loadRequestAuthorization,
  type RequestAuthorization,
} from "@/server/auth/authorization.server";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/server/db/neon.server", () => ({
  transaction: async <T>(work: (db: { query: Pool["query"] }) => Promise<T>): Promise<T> => {
    if (!holder.pool) throw new Error("PostgreSQL fixture unavailable");
    const client = await holder.pool.connect();
    try {
      await client.query("begin");
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },
  query: async (text: string, values: readonly unknown[] = [], db?: { query: Pool["query"] }) =>
    (await (db ?? holder.pool!).query(text, [...values])).rows,
  queryOne: async (text: string, values: readonly unknown[] = [], db?: { query: Pool["query"] }) =>
    (await (db ?? holder.pool!).query(text, [...values])).rows[0] ?? null,
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { commitLeadImport } from "@/server/repositories/lead-import";
import { commitClientImport } from "@/server/repositories/client-import";
import { commitEventImport } from "@/server/repositories/event-import";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const actor = "audit-import-sales";
const manager = "audit-import-manager";
const other = "audit-import-other";
const cs = "audit-import-cs";
const leadId = "67b90000-0000-4000-8000-000000000001";
const clientId = "67b90000-0000-4000-8000-000000000002";
const accountId = "67b90000-0000-4000-8000-000000000003";
const campaignId = "67b90000-0000-4000-8000-000000000004";
const productId = "67b90000-0000-4000-8000-000000000005";
const companyPrefix = "AUDIT IMPORT ";

function context(
  profileId: string,
  role: UserRole,
  overrides: PermissionOverride[] = [],
): RequestAuthorization {
  return {
    session: { profile: { id: profileId, role, status: "active" } } as AppSession,
    actor: {
      profileId,
      role,
      status: "active",
      managedDepartmentIds: [],
      managedTeamIds: [],
      directReportIds: [],
    },
    overrides,
    now: new Date(),
  };
}
function deny(
  profileId: string,
  capability: PermissionOverride["capability"],
  resourceType: string,
  resourceId: string,
): PermissionOverride {
  return { profileId, capability, effect: "deny", resourceType, resourceId };
}
const leadRow = {
  company_name: companyPrefix + "Existing Lead",
  contact_email: "existing@audit-import.test",
  contact_phone: "+852 9000 0000",
};
const clientRow = { company_name: companyPrefix + "Existing Client" };
const pool = () => holder.pool!;

describe("import row authorization on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
        path,
        sql: await readFile(path, "utf8"),
      })),
    );
    await runClientOpsMigrations(pool(), migrations);
    for (const [id, role] of [
      [actor, "sales"],
      [manager, "manager"],
      [other, "sales"],
      [cs, "client_success"],
    ]) {
      await pool().query(
        `insert into profiles (id,email,name,role,status)
         values ($1,$2,$1,$3,'active')
         on conflict (id) do update set role=excluded.role,status='active'`,
        [id, id + "@audit-import.test", role],
      );
    }
    await pool().query("delete from leads where company_name like $1", [companyPrefix + "%"]);
    await pool().query("delete from clients where company_name like $1", [companyPrefix + "%"]);
    await pool().query("delete from campaigns where id=$1", [campaignId]);
    await pool().query("delete from accounts where id=$1", [accountId]);
    await pool().query("delete from products where id=$1", [productId]);
    await pool().query(
      `insert into leads
      (id,company_name,contact_email,assigned_to,status,lead_score,source)
      values ($1,$2,$3,$4,'won',90,'csv')`,
      [leadId, leadRow.company_name, leadRow.contact_email, actor],
    );
    await pool().query(
      `insert into clients (id,company_name,account_owner)
      values ($1,$2,$3)`,
      [clientId, clientRow.company_name, actor],
    );
    await pool().query(
      `insert into products (id,name,billing_type,active)
      values ($1,$2,'retainer',true)`,
      [productId, companyPrefix + "Product"],
    );
    await pool().query(
      `insert into accounts (id,name,account_owner)
      values ($1,$2,$3)`,
      [accountId, companyPrefix + "Account", cs],
    );
    await pool().query(
      `insert into campaigns (id,name,owner)
      values ($1,$2,$3)`,
      [campaignId, companyPrefix + "Campaign", cs],
    );
  }, 60_000);
  afterAll(async () => {
    if (holder.pool) {
      await pool().query("delete from leads where company_name like $1", [companyPrefix + "%"]);
      await pool().query("delete from clients where company_name like $1", [companyPrefix + "%"]);
      await pool().query("delete from campaigns where id=$1", [campaignId]);
      await pool().query("delete from accounts where id=$1", [accountId]);
      await pool().query("delete from products where id=$1", [productId]);
      await pool().query("delete from profiles where id=any($1::text[])", [
        [actor, manager, other, cs],
      ]);
      await holder.pool.end();
      holder.pool = null;
    }
  });

  it.runIf(hasDatabase)("does not fill an existing lead when update is denied", async () => {
    const before = await pool().query(
      "select contact_phone,status,lead_score from leads where id=$1",
      [leadId],
    );
    await expect(
      commitLeadImport(
        [leadRow],
        actor,
        context(actor, "sales", [deny(actor, "leads.update", "lead", leadId)]),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const after = await pool().query(
      "select contact_phone,status,lead_score from leads where id=$1",
      [leadId],
    );
    expect(after.rows).toEqual(before.rows);
  });

  it.runIf(hasDatabase)("reloads a deny added after preview before committing", async () => {
    const oldPreviewContext = context(actor, "sales");
    expect(oldPreviewContext.overrides).toEqual([]);
    const overrideId = "67b90000-0000-4000-8000-000000000006";
    await pool().query("delete from permission_overrides where id=$1", [overrideId]);
    await pool().query(
      `insert into permission_overrides
      (id,profile_id,capability,effect,resource_type,resource_id,reason,granted_by)
      values ($1,$2,'leads.update','deny','lead',$3,'Audit import deny',$2)`,
      [overrideId, actor, leadId],
    );
    try {
      const commitContext = await loadRequestAuthorization(oldPreviewContext.session);
      expect(
        commitContext.overrides.some(
          (override) => override.capability === "leads.update" && override.effect === "deny",
        ),
      ).toBe(true);
      await expect(commitLeadImport([leadRow], actor, commitContext)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(
        (await pool().query("select contact_phone from leads where id=$1", [leadId])).rows[0]
          .contact_phone,
      ).toBeNull();
    } finally {
      await pool().query("delete from permission_overrides where id=$1", [overrideId]);
    }
  });

  it.runIf(hasDatabase)("rejects a client update denied on the matched record", async () => {
    await expect(
      commitClientImport(
        [{ ...clientRow, industry: "Finance" }],
        actor,
        context(actor, "sales", [deny(actor, "accounts.update", "client", clientId)]),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const client = await pool().query("select industry from clients where id=$1", [clientId]);
    expect(client.rows[0].industry).toBeNull();
  });

  it.runIf(hasDatabase)(
    "authorizes contact creation before any same-row client update",
    async () => {
      const email = "new-contact@audit-import.test";
      await expect(
        commitClientImport(
          [
            {
              ...clientRow,
              industry: "Finance",
              contact_email: email,
              contact_name: "Contact",
            },
          ],
          actor,
          context(actor, "sales", [deny(actor, "contacts.create", "client", clientId)]),
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(
        (await pool().query("select industry from clients where id=$1", [clientId])).rows[0]
          .industry,
      ).toBeNull();
      expect(
        (
          await pool().query("select id from client_contacts where client_id=$1 and email=$2", [
            clientId,
            email,
          ])
        ).rows,
      ).toEqual([]);
    },
  );

  it.runIf(hasDatabase)("checks a new engagement independently of account creation", async () => {
    await expect(
      commitClientImport(
        [
          {
            ...clientRow,
            product_name: companyPrefix + "Product",
            start_date: "2026-10-01",
          },
        ],
        actor,
        context(actor, "sales"),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await pool().query("select id from engagements where client_id=$1", [clientId])).rows,
    ).toEqual([]);
  });

  it.runIf(hasDatabase)(
    "rechecks a previewed client's owner and an actor's active state at commit",
    async () => {
      await pool().query("update clients set account_owner=$2 where id=$1", [clientId, other]);
      try {
        await expect(
          commitClientImport(
            [{ ...clientRow, industry: "Finance" }],
            manager,
            context(manager, "manager"),
          ),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      } finally {
        await pool().query("update clients set account_owner=$2 where id=$1", [clientId, actor]);
      }
      await pool().query("update profiles set status='deactivated' where id=$1", [actor]);
      try {
        await expect(
          commitLeadImport(
            [
              {
                company_name: companyPrefix + "Inactive",
                contact_email: "inactive@audit-import.test",
              },
            ],
            actor,
            context(actor, "sales"),
          ),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      } finally {
        await pool().query("update profiles set status='active' where id=$1", [actor]);
      }
      expect(
        (
          await pool().query("select id from leads where company_name=$1", [
            companyPrefix + "Inactive",
          ])
        ).rows,
      ).toEqual([]);
    },
  );

  it.runIf(hasDatabase)("rolls back a prior create when a later row is forbidden", async () => {
    const newName = companyPrefix + "Rollback Lead";
    await expect(
      commitLeadImport(
        [{ company_name: newName, contact_email: "rollback@audit-import.test" }, leadRow],
        actor,
        context(actor, "sales", [deny(actor, "leads.update", "lead", leadId)]),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await pool().query("select id from leads where company_name=$1", [newName])).rows,
    ).toEqual([]);
  });

  it.runIf(hasDatabase)(
    "preserves a create-only client path and repeat import idempotency",
    async () => {
      const newName = companyPrefix + "Create Only";
      expect(
        await commitClientImport([{ company_name: newName }], actor, context(actor, "sales")),
      ).toMatchObject({ created: 1, updated: 0 });
      const before = await pool().query(
        "select id,updated_at::text from clients where company_name=$1",
        [newName],
      );
      expect(
        await commitClientImport([{ company_name: newName }], actor, context(actor, "sales")),
      ).toMatchObject({ created: 0, updated: 0, skipped: 1 });
      const after = await pool().query(
        "select id,updated_at::text from clients where company_name=$1",
        [newName],
      );
      expect(after.rows).toEqual(before.rows);
    },
  );

  it.runIf(hasDatabase)(
    "does not create an event member or contact when contact creation is denied",
    async () => {
      const email = "event-contact@audit-import.test";
      await expect(
        commitEventImport({
          campaignId,
          owner: cs,
          authorization: context(cs, "client_success", [
            deny(cs, "contacts.create", "account", accountId),
          ]),
          rows: [
            {
              company_name: companyPrefix + "Account",
              contact_name: "Event Contact",
              email,
              phone: "",
              attendee_status: "attended",
              interests: [],
              notes: "",
              account_match: { kind: "matched", accountId, matchedBy: "name" },
              contact_match: { kind: "new" },
            },
          ],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(
        (
          await pool().query("select id from account_contacts where account_id=$1 and email=$2", [
            accountId,
            email,
          ])
        ).rows,
      ).toEqual([]);
      expect(
        (await pool().query("select id from campaign_members where campaign_id=$1", [campaignId]))
          .rows,
      ).toEqual([]);
    },
  );
});
