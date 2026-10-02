import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USER_ROLES, type ActorAccessContext, type PermissionOverride } from "@/lib/admin/types";
import { evaluateAuthorization } from "@/lib/admin/policy";
import type { AppSession } from "@/lib/auth/neon-auth.server";
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { buildVisibilityScope, type VisibleResourceType } from "../visibility-scope.server";
import type { RequestAuthorization } from "../authorization.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const now = new Date("2026-09-27T04:00:00.000Z");
const records = [
  { id: "own", account_owner: "actor-1" },
  { id: "report", account_owner: "report-1" },
  { id: "other", account_owner: "other-1" },
  { id: "unowned", account_owner: null },
  { id: "denied", account_owner: "actor-1" },
  { id: "explicit-allow", account_owner: "other-1" },
  { id: "expired-allow", account_owner: "other-1" },
];
const overrides: PermissionOverride[] = [
  {
    profileId: "actor-1",
    capability: "accounts.view",
    effect: "deny",
    resourceType: "account",
    resourceId: "denied",
  },
  {
    profileId: "actor-1",
    capability: "accounts.view",
    effect: "allow",
    resourceType: "account",
    resourceId: "explicit-allow",
  },
  {
    profileId: "actor-1",
    capability: "accounts.view",
    effect: "allow",
    resourceType: "account",
    resourceId: "expired-allow",
    expiresAt: "2026-09-26T00:00:00.000Z",
  },
];

let pool: Pool;
describe("SQL visibility scope matches the policy evaluator", () => {
  beforeAll(() => {
    if (hasDatabase) pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
  });
  afterAll(async () => {
    await pool?.end();
  });

  for (const role of USER_ROLES) {
    it.runIf(hasDatabase)(
      `matches account row decisions for ${role}, allow/deny/expiry and manager scope`,
      async () => {
        const actor: ActorAccessContext = {
          profileId: "actor-1",
          role,
          status: "active",
          managedDepartmentIds: [],
          managedTeamIds: [],
          directReportIds: ["report-1"],
        };
        const context = {
          session: { profile: { id: "actor-1" } } as AppSession,
          actor,
          overrides,
          now,
        } satisfies RequestAuthorization;
        const scope = buildVisibilityScope(context, "account", "a");
        const parameter = "$" + (scope.values.length + 1);
        const result = await pool.query<{ id: string }>(
          `select a.id from jsonb_to_recordset(${parameter}::jsonb) as a(id text, account_owner text) where ${scope.sql}`,
          [...scope.values, JSON.stringify(records)],
        );
        const expected = records
          .filter(
            (record) =>
              evaluateAuthorization({
                actor,
                capability: "accounts.view",
                target: {
                  resourceType: "account",
                  resourceId: record.id,
                  ...(record.account_owner ? { ownerProfileId: record.account_owner } : {}),
                },
                overrides,
                now,
              }).allowed,
          )
          .map((record) => record.id);
        expect(result.rows.map((row) => row.id)).toEqual(expected);
      },
    );
  }

  it.runIf(hasDatabase)(
    "compiles all supported resource predicates against the migrated schema",
    async () => {
      const tables: Record<VisibleResourceType, string> = {
        deal: "deals",
        project: "projects",
        customer_success_profile: "customer_success_profiles",
        engagement_event: "engagement_events",
        contact: "account_contacts",
        channel_identity: "channel_identities",
        automation_playbook: "automation_playbooks",
        automation_run: "automation_runs",
        success_touchpoint: "success_touchpoints",
        account: "accounts",
        client: "clients",
        lead: "leads",
        campaign: "campaigns",
        campaign_member: "campaign_members",
        task: "tasks",
        engagement: "engagements",
        human_approval: "human_approvals",
        quote: "quotes",
        job_sheet: "job_sheets",
        job_sheet_portion: "job_sheet_portions",
        account_contact: "account_contacts",
        client_contact: "client_contacts",
        touchpoint: "touchpoints",
        relationship_signal: "relationship_signals",
      };
      const context = {
        session: { profile: { id: "actor-1" } } as AppSession,
        actor: {
          profileId: "actor-1",
          role: "read_only",
          status: "active",
          managedDepartmentIds: [],
          managedTeamIds: [],
          directReportIds: [],
        },
        overrides: [],
        now,
      } satisfies RequestAuthorization;
      for (const [resourceType, table] of Object.entries(tables)) {
        const scope = buildVisibilityScope(context, resourceType, "row");
        await expect(
          pool.query(`select row.id from ${table} row where ${scope.sql} limit 0`, [
            ...scope.values,
          ]),
        ).resolves.toMatchObject({ rows: [] });
      }
    },
  );
  it.runIf(hasDatabase)("fails closed for an unsupported legacy resource type", async () => {
    const context = {
      session: { profile: { id: "actor-1" } } as AppSession,
      actor: {
        profileId: "actor-1",
        role: "super_admin",
        status: "active",
        managedDepartmentIds: [],
        managedTeamIds: [],
        directReportIds: [],
      },
      overrides: [],
      now,
    } satisfies RequestAuthorization;
    const scope = buildVisibilityScope(context, "unknown_resource", "a");
    const result = await pool.query(`select 1 from (values (1)) as a(id) where ${scope.sql}`, [
      ...scope.values,
    ]);
    expect(result.rows).toEqual([]);
  });
});
