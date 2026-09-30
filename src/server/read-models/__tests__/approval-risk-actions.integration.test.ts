import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { UserRole } from "@/lib/admin/types";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const holder = vi.hoisted(() => ({
  pool: null as Pool | null,
  reads: [] as Array<{ sql: string; values: readonly unknown[] }>,
}));
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = []) => {
    holder.reads.push({ sql, values });
    return (await holder.pool!.query(sql, [...values])).rows;
  },
}));
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { withApprovalActionFlags } from "../approval-actions.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const actorId = "audit-risk-affordance-" + randomUUID();
const outsiderId = "audit-risk-outsider-" + randomUUID();
const clientId = randomUUID(),
  productId = randomUUID();
const ownedId = randomUUID(),
  outsideId = randomUUID();
const approvalId = randomUUID();
function context(role: UserRole = "manager"): RequestAuthorization {
  return {
    session: { profile: { id: actorId, role, status: "active" } } as AppSession,
    actor: {
      profileId: actorId,
      role,
      status: "active",
      directReportIds: [],
      managedTeamIds: [],
      managedDepartmentIds: [],
    },
    overrides: [],
    now: new Date("2026-09-30T06:00:00Z"),
  };
}
function row(engagementId: unknown = ownedId) {
  return {
    id: approvalId,
    assigned_to: actorId,
    approval_type: "cs_risk_review" as const,
    status: "pending" as const,
    context_data: { engagement_id: engagementId },
  };
}
describe("risk decision affordances against real PostgreSQL ownership", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 2 });
    await runClientOpsMigrations(
      holder.pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
    for (const id of [actorId, outsiderId]) {
      await holder.pool.query(
        "insert into profiles(id,email,name,role,status) values($1,$2,'Synthetic risk reviewer','manager','active')",
        [id, id + "@audit.test"],
      );
    }
    await holder.pool.query(
      "insert into clients(id,company_name) values($1,'Synthetic risk client')",
      [clientId],
    );
    await holder.pool.query(
      "insert into products(id,name,billing_type) values($1,'Synthetic risk product','retainer')",
      [productId],
    );
    for (const [id, owner] of [
      [ownedId, actorId],
      [outsideId, outsiderId],
    ]) {
      await holder.pool.query(
        "insert into engagements(id,client_id,product_id,owner,billing_period) values($1,$2,$3,$4,'monthly')",
        [id, clientId, productId, owner],
      );
    }
  }, 60_000);
  beforeEach(() => {
    holder.reads.length = 0;
  });
  afterAll(async () => {
    if (!holder.pool) return;
    await holder.pool.query("delete from engagements where id=any($1::uuid[])", [
      [ownedId, outsideId],
    ]);
    await holder.pool.query("delete from products where id=$1", [productId]);
    await holder.pool.query("delete from clients where id=$1", [clientId]);
    await holder.pool.query("delete from profiles where id=any($1::text[])", [
      [actorId, outsiderId],
    ]);
    await holder.pool.end();
  });
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
    ] as const)("evaluates %s separately using the persisted linked owner", async (role) => {
    const [result] = await withApprovalActionFlags(context(role), [row()]);
    expect(result.can_decide).toBe(["super_admin", "admin", "manager"].includes(role));
    expect(result).not.toHaveProperty("owner_profile_id");
  });
  it.runIf(hasDatabase)(
    "keeps routing but removes decisions under an explicit engagement deny",
    async () => {
      const actor = context();
      actor.overrides = [
        {
          profileId: actorId,
          capability: "engagements.update",
          effect: "deny",
          resourceType: "engagement",
          resourceId: ownedId,
        },
      ];
      const [result] = await withApprovalActionFlags(actor, [row()]);
      expect(result).toMatchObject({
        can_decide: false,
        can_assign: true,
        can_request_changes: true,
      });
    },
  );
  it.runIf(hasDatabase)(
    "does not apply approval ownership to an unrelated engagement",
    async () => {
      const [result] = await withApprovalActionFlags(context(), [row(outsideId)]);
      expect(result.can_decide).toBe(false);
      expect(result.can_assign).toBe(true);
    },
  );
  it.runIf(hasDatabase)("honors only the linked scoped grant and its expiry", async () => {
    const actor = context();
    actor.overrides = [
      {
        profileId: actorId,
        capability: "engagements.update",
        effect: "allow",
        resourceType: "engagement",
        resourceId: outsideId,
      },
    ];
    expect((await withApprovalActionFlags(actor, [row(outsideId)]))[0].can_decide).toBe(true);
    actor.overrides[0].expiresAt = "2026-09-30T05:59:59Z";
    expect((await withApprovalActionFlags(actor, [row(outsideId)]))[0].can_decide).toBe(false);
  });
  it.runIf(hasDatabase)(
    "requires both independent grants for an otherwise denied role",
    async () => {
      const actor = context("read_only");
      actor.overrides = [
        {
          profileId: actorId,
          capability: "approvals.decide",
          effect: "allow",
          resourceType: "human_approval",
          resourceId: approvalId,
        },
      ];
      expect((await withApprovalActionFlags(actor, [row()]))[0].can_decide).toBe(false);
      actor.overrides.push({
        profileId: actorId,
        capability: "engagements.update",
        effect: "allow",
        resourceType: "engagement",
        resourceId: ownedId,
      });
      expect((await withApprovalActionFlags(actor, [row()]))[0].can_decide).toBe(true);
      actor.overrides.push({
        profileId: actorId,
        capability: "engagements.update",
        effect: "deny",
        resourceType: "engagement",
        resourceId: ownedId,
      });
      expect((await withApprovalActionFlags(actor, [row()]))[0].can_decide).toBe(false);
    },
  );
  it.runIf(hasDatabase)(
    "fails closed for absent, malformed and missing persisted targets without invalid SQL",
    async () => {
      const missingId = randomUUID();
      const rows = [
        row(null),
        row("not-a-uuid"),
        row(42),
        row(missingId),
        {
          ...row(),
          context_data: null,
        },
      ];
      const result = await withApprovalActionFlags(context("super_admin"), rows);
      expect(
        result.every((item) => !item.can_decide && item.can_assign && item.can_request_changes),
      ).toBe(true);
      expect(holder.reads).toHaveLength(1);
      expect(holder.reads[0].values).toEqual([[missingId]]);
    },
  );
  it.runIf(hasDatabase)(
    "batches 100 targets, normalizes UUID case and returns no ownership columns",
    async () => {
      const rows = Array.from({ length: 100 }, (_, i) => ({
        ...row(i % 2 ? outsideId : ownedId.toUpperCase()),
        id: randomUUID(),
      }));
      const result = await withApprovalActionFlags(context(), rows);
      expect(holder.reads).toHaveLength(1);
      expect(holder.reads[0].values).toEqual([[ownedId, outsideId]]);
      expect(result.filter((item) => item.can_decide)).toHaveLength(50);
      for (let i = 0; i < rows.length; i++) {
        expect(Object.keys(result[i]).sort()).toEqual(
          [...Object.keys(rows[i]), "can_decide", "can_assign", "can_request_changes"].sort(),
        );
      }
    },
  );
  it.runIf(hasDatabase)(
    "uses current persisted ownership after reassignment and keeps terminal decisions unavailable",
    async () => {
      await holder.pool!.query("update engagements set owner=$1 where id=$2", [
        outsiderId,
        ownedId,
      ]);
      try {
        expect((await withApprovalActionFlags(context(), [row()]))[0].can_decide).toBe(false);
      } finally {
        await holder.pool!.query("update engagements set owner=$1 where id=$2", [actorId, ownedId]);
      }
      const [terminal] = await withApprovalActionFlags(context(), [
        { ...row(), status: "approved" as const },
      ]);
      expect(terminal).toMatchObject({
        can_decide: false,
        can_assign: false,
        can_request_changes: false,
      });
    },
  );
});
