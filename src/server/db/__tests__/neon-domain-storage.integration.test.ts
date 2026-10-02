import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ pools: [] as import("pg").Pool[] }));
// Only the wire transport changes. Production query normalization, SQL and transactions run.
vi.mock("@neondatabase/serverless", async () => {
  const pg = await import("pg");
  return {
    types: pg.types,
    Pool: class extends pg.Pool {
      constructor(options: import("pg").PoolConfig) {
        super(options);
        transport.pools.push(this);
      }
    },
  };
});

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import {
  createDeal,
  updateDeal,
  getDealWorkspace,
  listDeals,
  listOpenDeals,
} from "@/server/repositories/deals";
import { createProject, getProjectWorkspace } from "@/server/repositories/projects";
import {
  createEngagementEvent,
  upsertChannelIdentity,
} from "@/server/repositories/engagement-events";
import {
  createAutomationPlaybook,
  createAutomationRun,
  getAutomationPlaybookDetail,
} from "@/server/repositories/automation-playbooks";
import {
  upsertCustomerSuccessProfile,
  createSuccessTouchpoint,
  getCustomerSuccessAccountWorkspace,
} from "@/server/repositories/customer-success";
import { resolveOwnerProfileIds } from "@/server/auth/resource-ownership";
import { buildVisibilityScope } from "@/server/auth/visibility-scope.server";
import {
  loadRequestAuthorization,
  requireCapability,
  type RequestAuthorization,
} from "@/server/auth/authorization.server";
import { authorizeDomainLinks } from "@/server/auth/domain-links.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";
import type { Profile } from "@/lib/types";

const enabled = Boolean(process.env.DATABASE_TEST_URL);
const owner = "neon-only-domain-owner";
const roles = [
  "super_admin",
  "admin",
  "manager",
  "sales",
  "client_success",
  "accounting",
  "read_only",
] as const;
const managerId = "neon-only-role-manager";
const accountId = randomUUID();
const contactId = randomUUID();
const campaignId = randomUUID();
const memberId = randomUUID();
let pool: Pool;

describe.runIf(enabled)("Neon-only domain storage on real PostgreSQL", () => {
  beforeAll(async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    await runClientOpsMigrations(
      pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
    await pool.query(
      "insert into profiles(id,email,name,role) values ($1,'neon-only@example.invalid','Neon Only','sales')",
      [owner],
    );
    for (const role of roles)
      await pool.query("insert into profiles(id,email,name,role) values ($1,$2,$3,$4)", [
        "neon-only-role-" + role,
        role + "-neon-only@example.invalid",
        role,
        role,
      ]);
    await pool.query("update profiles set manager_profile_id=$1 where id=$2", [managerId, owner]);
    await pool.query(
      "insert into accounts(id,name,account_owner) values ($1,'Synthetic Neon account',$2)",
      [accountId, owner],
    );
    await pool.query(
      "insert into account_contacts(id,account_id,name) values ($1,$2,'Synthetic contact')",
      [contactId, accountId],
    );
    await pool.query("insert into campaigns(id,name,owner) values ($1,'Synthetic campaign',$2)", [
      campaignId,
      owner,
    ]);
    await pool.query(
      "insert into campaign_members(id,campaign_id,account_id,contact_id) values ($1,$2,$3,$4)",
      [memberId, campaignId, accountId, contactId],
    );
  }, 60_000);
  afterAll(async () => {
    if (pool) {
      await pool
        .query("drop trigger if exists neon_only_fail_touch on customer_success_profiles")
        .catch(() => undefined);
      await pool
        .query("drop trigger if exists neon_only_fail_event on campaign_members")
        .catch(() => undefined);
      await pool.query("drop function if exists neon_only_fail_stamp()").catch(() => undefined);
      for (const table of [
        "automation_runs",
        "engagement_events",
        "channel_identities",
        "success_touchpoints",
        "customer_success_profiles",
        "projects",
        "deals",
        "campaign_members",
        "account_contacts",
        "tasks",
      ]) {
        await pool
          .query(`delete from ${table} where account_id=$1`, [accountId])
          .catch(() => undefined);
      }
      await pool
        .query("delete from automation_playbooks where created_by=$1", [owner])
        .catch(() => undefined);
      await pool.query("delete from campaigns where id=$1", [campaignId]);
      await pool.query("delete from accounts where id=$1", [accountId]);
      await pool.query("delete from profiles where id=$1", [owner]);
      await pool.query("delete from profiles where id=any($1::text[])", [
        roles.map((role) => "neon-only-role-" + role),
      ]);
      await pool.end();
    }
    await Promise.all(transport.pools.map((p) => p.end()));
  });

  it("registers all eight domain tables with default-deny row security", async () => {
    const result = await pool.query(
      "select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname=any($1)",
      [
        [
          "deals",
          "projects",
          "engagement_events",
          "channel_identities",
          "automation_playbooks",
          "automation_runs",
          "customer_success_profiles",
          "success_touchpoints",
        ],
      ],
    );
    expect(result.rows).toHaveLength(8);
    expect(result.rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it("uses canonical contacts, text profile IDs and numeric money without Supabase configuration", async () => {
    const deal = await createDeal({
      name: "Neon deal",
      account_id: accountId,
      contact_id: contactId,
      owner,
      value: 1234.56,
    });
    expect(deal.value).toBe(1234.56);
    expect(deal.owner).toBe(owner);
    expect(typeof deal.created_at).toBe("string");
    const project = await createProject({
      name: "Neon project",
      account_id: accountId,
      contact_id: contactId,
      deal_id: deal.id,
      owner,
    });
    await pool.query(
      "insert into tasks(title,account_id,project_id,deal_id,assigned_to) values ('Neon workspace task',$1,$2,$3,$4)",
      [accountId, project.id, deal.id, owner],
    );
    expect((await getDealWorkspace(deal.id)).tasks).toHaveLength(1);
    expect((await getProjectWorkspace(project.id)).tasks).toHaveLength(1);
    expect((await getCustomerSuccessAccountWorkspace(accountId)).tasks).toHaveLength(1);
    const ids = [deal.id, randomUUID()];
    const owners = await resolveOwnerProfileIds("deal", ids);
    expect(owners.get(deal.id)).toBe(owner);
    expect(owners.get(ids[1])).toBeNull();
  });

  it("does not allow caller-supplied IDs or created_at on writes", async () => {
    const forgedId = randomUUID();
    const deal = await createDeal({
      name: "Allowlist",
      account_id: accountId,
      id: forgedId,
    } as Parameters<typeof createDeal>[0]);
    expect(deal.id).not.toBe(forgedId);
    const changed = await updateDeal(deal.id, {
      name: "Updated",
      created_at: "1990-01-01T00:00:00Z",
    });
    expect(changed.name).toBe("Updated");
    expect(changed.created_at).toBe(deal.created_at);
    expect((await updateDeal(deal.id, {})).id).toBe(deal.id);
  });

  it("distinguishes null clears from omitted updates and filters open forecasts by close date", async () => {
    const early = await createDeal({
      name: "Early forecast",
      account_id: accountId,
      owner,
      expected_close_date: "2026-10-01",
    });
    const late = await createDeal({
      name: "Late forecast",
      account_id: accountId,
      owner,
      expected_close_date: "2027-10-01",
    });
    const cleared = await updateDeal(early.id, { owner: null, account_id: undefined });
    expect(cleared.owner).toBeNull();
    expect(cleared.account_id).toBe(accountId);
    expect(
      (await listOpenDeals({ owner, close_before: "2026-12-31" })).some(
        (row) => row.id === late.id,
      ),
    ).toBe(false);
    expect(
      (await listDeals({ account_id: accountId, status: "open" })).some(
        (row) => row.id === early.id,
      ),
    ).toBe(true);
  });

  it("bounds workspace event history and rejects cross-account contact links", async () => {
    const deal = await createDeal({ name: "Bounded history", account_id: accountId });
    await pool.query(
      "insert into engagement_events(account_id,deal_id,channel,event_type,occurred_at) select $1,$2,'manual','synthetic-history','2026-10-01'::timestamptz+n*interval '1 minute' from generate_series(1,55) n",
      [accountId, deal.id],
    );
    const workspace = await getDealWorkspace(deal.id);
    expect(workspace.engagementEvents).toHaveLength(50);
    expect(workspace.engagementEvents[0].occurred_at).toBe("2026-10-01T00:55:00.000Z");
    const otherAccount = randomUUID();
    await pool.query("insert into accounts(id,name) values ($1,'Foreign link test')", [
      otherAccount,
    ]);
    try {
      await expect(
        createDeal({ name: "Invalid contact", account_id: otherAccount, contact_id: contactId }),
      ).rejects.toThrow("Could not create this deal");
    } finally {
      await pool.query("delete from accounts where id=$1", [otherAccount]);
    }
  });

  it("atomically converges concurrent channel identity upserts to one row", async () => {
    const externalId = randomUUID();
    const rows = await Promise.all(
      Array.from({ length: 12 }, () =>
        upsertChannelIdentity({
          channel: "email",
          external_id: externalId,
          account_id: accountId,
          contact_id: contactId,
          metadata: { synthetic: true },
        }),
      ),
    );
    expect(new Set(rows.map((r) => r.id)).size).toBe(1);
    expect(
      (
        await pool.query(
          "select count(*)::int n from channel_identities where channel='email' and external_id=$1",
          [externalId],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it("keeps anonymous channel identities independent when external_id is blank or null", async () => {
    const rows = await Promise.all(
      [null, null, "", ""].map((external_id) =>
        upsertChannelIdentity({ channel: "manual", external_id, account_id: accountId }),
      ),
    );
    expect(new Set(rows.map((row) => row.id)).size).toBe(4);
    expect(rows.every((row) => row.external_id === null)).toBe(true);
  });

  it("refuses an identity conflict that belongs outside the manager's scope", async () => {
    const foreignAccount = randomUUID();
    const foreignOwner = "neon-only-foreign-owner";
    const externalId = randomUUID();
    await pool.query(
      "insert into profiles(id,email,name,role) values ($1,'foreign-neon@example.invalid','Foreign','sales')",
      [foreignOwner],
    );
    await pool.query(
      "insert into accounts(id,name,account_owner) values ($1,'Foreign synthetic account',$2)",
      [foreignAccount, foreignOwner],
    );
    try {
      const original = await upsertChannelIdentity({
        channel: "email",
        external_id: externalId,
        account_id: foreignAccount,
      });
      const context = {
        actor: {
          profileId: managerId,
          role: "manager",
          status: "active",
          directReportIds: [owner],
        },
        overrides: [],
        now: new Date(),
      } as unknown as RequestAuthorization;
      await expect(
        upsertChannelIdentity(
          { channel: "email", external_id: externalId, account_id: accountId },
          context,
        ),
      ).rejects.toThrow("Could not save this channel identity");
      expect(
        (await pool.query("select account_id from channel_identities where id=$1", [original.id]))
          .rows[0].account_id,
      ).toBe(foreignAccount);
    } finally {
      await pool.query("delete from channel_identities where external_id=$1", [externalId]);
      await pool.query("delete from accounts where id=$1", [foreignAccount]);
      await pool.query("delete from profiles where id=$1", [foreignOwner]);
    }
  });

  it("atomically converges customer success profiles and never regresses last-touch time", async () => {
    const profiles = await Promise.all(
      Array.from({ length: 8 }, () =>
        upsertCustomerSuccessProfile({
          account_id: accountId,
          cs_owner: owner,
          renewal_risk: "low",
          next_best_action: "Synthetic review",
        }),
      ),
    );
    expect(new Set(profiles.map((r) => r.id)).size).toBe(1);
    await Promise.all(
      ["2026-10-03T10:00:00Z", "2026-10-01T10:00:00Z"].map((occurred_at) =>
        createSuccessTouchpoint({ account_id: accountId, occurred_at }),
      ),
    );
    expect((await getCustomerSuccessAccountWorkspace(accountId)).profile?.last_touch_at).toBe(
      "2026-10-03T10:00:00.000Z",
    );
  });

  it("rolls back a touchpoint when the profile timestamp update fails", async () => {
    await pool.query(
      "create or replace function neon_only_fail_stamp() returns trigger language plpgsql as $$begin raise exception 'synthetic stamp failure'; end$$",
    );
    await pool.query(
      "create trigger neon_only_fail_touch before update on customer_success_profiles for each row execute function neon_only_fail_stamp()",
    );
    try {
      const before = (
        await pool.query("select count(*)::int n from success_touchpoints where account_id=$1", [
          accountId,
        ])
      ).rows[0].n;
      await expect(createSuccessTouchpoint({ account_id: accountId })).rejects.toThrow(
        "Could not record this success touchpoint",
      );
      expect(
        (
          await pool.query("select count(*)::int n from success_touchpoints where account_id=$1", [
            accountId,
          ])
        ).rows[0].n,
      ).toBe(before);
    } finally {
      await pool.query("drop trigger neon_only_fail_touch on customer_success_profiles");
    }
  });

  it("rolls back an engagement event when its campaign member timestamp update fails", async () => {
    await pool.query(
      "create or replace function neon_only_fail_stamp() returns trigger language plpgsql as $$begin raise exception 'synthetic stamp failure'; end$$",
    );
    await pool.query(
      "create trigger neon_only_fail_event before update on campaign_members for each row execute function neon_only_fail_stamp()",
    );
    try {
      const before = (
        await pool.query("select count(*)::int n from engagement_events where account_id=$1", [
          accountId,
        ])
      ).rows[0].n;
      await expect(
        createEngagementEvent({
          account_id: accountId,
          campaign_member_id: memberId,
          campaign_id: campaignId,
          channel: "email",
          event_type: "synthetic",
        }),
      ).rejects.toThrow("Could not record this engagement event");
      expect(
        (
          await pool.query("select count(*)::int n from engagement_events where account_id=$1", [
            accountId,
          ])
        ).rows[0].n,
      ).toBe(before);
    } finally {
      await pool.query("drop trigger neon_only_fail_event on campaign_members");
    }
  });

  it("cannot stamp a campaign member from another account", async () => {
    const otherAccount = randomUUID(),
      otherMember = randomUUID();
    await pool.query("insert into accounts(id,name) values ($1,'Foreign event target')", [
      otherAccount,
    ]);
    await pool.query("insert into campaign_members(id,campaign_id,account_id) values ($1,$2,$3)", [
      otherMember,
      campaignId,
      otherAccount,
    ]);
    try {
      await expect(
        createEngagementEvent({
          account_id: accountId,
          campaign_member_id: otherMember,
          channel: "manual",
          event_type: "wrong-account",
        }),
      ).rejects.toThrow("Could not record this engagement event");
      expect(
        (await pool.query("select last_event_at from campaign_members where id=$1", [otherMember]))
          .rows[0].last_event_at,
      ).toBeNull();
    } finally {
      await pool.query("delete from engagement_events where campaign_member_id=$1", [otherMember]);
      await pool.query("delete from campaign_members where id=$1", [otherMember]);
      await pool.query("delete from accounts where id=$1", [otherAccount]);
    }
  });

  it("round-trips JSON playbook steps and context without dispatching providers", async () => {
    const steps = [{ type: "manual", data: { synthetic: true } }];
    const playbook = await createAutomationPlaybook({
      name: "Synthetic playbook",
      trigger_type: "manual",
      created_by: owner,
      steps,
    });
    const run = await createAutomationRun({
      playbook_id: playbook.id,
      account_id: accountId,
      context_data: { synthetic: true },
    });
    expect((await getAutomationPlaybookDetail(playbook.id)).playbook.steps).toEqual(steps);
    expect(run.context_data).toEqual({ synthetic: true });
    expect((await resolveOwnerProfileIds("automation_run", [run.id])).get(run.id)).toBe(owner);
  });

  it("keeps raw PostgreSQL errors out of repository responses", async () => {
    await expect(
      createDeal({ name: "Bad owner", account_id: accountId, owner: "missing-profile" }),
    ).rejects.toThrow("Could not create this deal");
    try {
      await createDeal({ name: "Bad owner", account_id: accountId, owner: "missing-profile" });
    } catch (error) {
      expect((error as Error).message).not.toMatch(/constraint|profiles|foreign key/i);
    }
  });

  it("applies manager ownership and deny overrides to domain list predicates", async () => {
    const context = {
      actor: { profileId: managerId, role: "manager", status: "active", directReportIds: [] },
      overrides: [],
      now: new Date(),
    } as unknown as RequestAuthorization;
    const scope = buildVisibilityScope(context, "deal", "d");
    const visible = (
      await pool.query(`select d.id from deals d where d.account_id=$6 and ${scope.sql}`, [
        ...scope.values,
        accountId,
      ])
    ).rows;
    expect(visible).toEqual([]);
    context.actor.directReportIds = [owner];
    const ownScope = buildVisibilityScope(context, "deal", "d");
    expect(
      (
        await pool.query(`select d.id from deals d where d.account_id=$6 and ${ownScope.sql}`, [
          ...ownScope.values,
          accountId,
        ])
      ).rows.length,
    ).toBeGreaterThan(0);
    expect((await listDeals({ account_id: accountId }, context)).length).toBeGreaterThan(0);
    const denied = (await listDeals({ account_id: accountId }, context))[0];
    context.overrides = [
      {
        profileId: managerId,
        capability: "accounts.view",
        effect: "deny",
        resourceType: "deal",
        resourceId: denied.id,
      },
    ];
    expect(
      (await listDeals({ account_id: accountId }, context)).some((row) => row.id === denied.id),
    ).toBe(false);
  });

  it.each(roles)(
    "uses a distinct persisted %s fixture for domain read/write authorization",
    async (role) => {
      const profile = (
        await pool.query<Profile>("select * from profiles where id=$1", ["neon-only-role-" + role])
      ).rows[0];
      expect(profile.role).toBe(role);
      const session = {
        user: { id: profile.id, email: profile.email },
        session: { id: "fixture-session-" + role },
        profile,
      } as AppSession;
      const context = await loadRequestAuthorization(session);
      const deal = await createDeal({
        name: "Role boundary " + role,
        account_id: accountId,
        owner,
      });
      await expect(
        requireCapability("accounts.view", { resourceType: "deal", resourceId: deal.id }, context),
      ).resolves.toBe(session);
      expect(
        (await listDeals({ account_id: accountId }, context)).some((row) => row.id === deal.id),
      ).toBe(true);
      if (role === "accounting" || role === "read_only")
        await expect(
          requireCapability(
            "accounts.update",
            { resourceType: "deal", resourceId: deal.id },
            context,
          ),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      else
        await expect(
          requireCapability(
            "accounts.update",
            { resourceType: "deal", resourceId: deal.id },
            context,
          ),
        ).resolves.toBe(session);
    },
  );

  it("checks every linked parent instead of authorizing only the first allowed account", async () => {
    const profile = (await pool.query<Profile>("select * from profiles where id=$1", [managerId]))
      .rows[0];
    const context = await loadRequestAuthorization({
      user: { id: profile.id, email: profile.email },
      session: { id: "fixture-parent-session" },
      profile,
    } as AppSession);
    const foreignAccount = randomUUID();
    const foreignContact = randomUUID();
    await pool.query("insert into accounts(id,name) values ($1,'Foreign authorization fixture')", [
      foreignAccount,
    ]);
    await pool.query(
      "insert into account_contacts(id,account_id,name) values ($1,$2,'Foreign contact')",
      [foreignContact, foreignAccount],
    );
    try {
      await expect(
        authorizeDomainLinks(
          "accounts.create",
          { account_id: accountId, contact_id: foreignContact },
          context,
        ),
      ).rejects.toMatchObject({ code: "OUTSIDE_SCOPE" });
    } finally {
      await pool.query("delete from accounts where id=$1", [foreignAccount]);
    }
  });
  it("measures actual scoped workspace runtime and query count", async () => {
    const deal = (
      await pool.query("select id from deals where account_id=$1 and name='Bounded history'", [
        accountId,
      ])
    ).rows[0];
    const profile = (await pool.query<Profile>("select * from profiles where id=$1", [managerId]))
      .rows[0];
    const context = await loadRequestAuthorization({
      user: { id: profile.id, email: profile.email },
      session: { id: "fixture-runtime-session" },
      profile,
    } as AppSession);
    await getDealWorkspace(deal.id, context);
    const spy = vi.spyOn(transport.pools[0], "query");
    const samples: number[] = [];
    try {
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        const workspace = await getDealWorkspace(deal.id, context);
        samples.push(performance.now() - start);
        expect(workspace.engagementEvents).toHaveLength(50);
      }
      expect(spy.mock.calls.length).toBe(120);
      const sorted = [...samples].sort((a, b) => a - b);
      console.info(
        "NEON_DOMAIN_RUNTIME",
        JSON.stringify({
          backend: "real isolated PostgreSQL 17",
          mode: "warm repository SQL; no SSR/browser",
          samplesMs: samples,
          p50Ms: sorted[14],
          p95Ms: sorted[28],
          queries: spy.mock.calls.length,
          queriesPerWorkspace: 4,
          eventRowsReturned: 50,
          before: null,
          beforeReason: "Supabase access forbidden; no valid historical runtime baseline",
        }),
      );
    } finally {
      spy.mockRestore();
    }
  });
});
