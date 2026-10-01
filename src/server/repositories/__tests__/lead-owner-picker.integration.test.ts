import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";
import type { UserRole } from "@/lib/admin/types";

const holder = vi.hoisted(() => ({ client: null as PoolClient | null }));
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = []) =>
    (await holder.client!.query(sql, [...values])).rows,
}));
import { listAssignableProfiles, resolveAssignableProfile } from "../assignable-profiles";
const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
let pool: Pool | null = null;
function context(role: UserRole = "admin"): RequestAuthorization {
  return {
    session: {} as AppSession,
    actor: {
      profileId: "viewer",
      role,
      status: "active",
      managedDepartmentIds: [],
      managedTeamIds: [],
      directReportIds: ["person-250"],
    },
    overrides: [],
    now: new Date("2026-10-01T00:00:00Z"),
  };
}
describe("Lead owner picker on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 1 });
    holder.client = await pool.connect();
    await holder.client.query("begin");
    await holder.client.query("set local search_path=pg_temp,pg_catalog");
    await holder.client.query(`
      create temp table profiles(id text primary key,name text,status text,role text,email text);
      create temp table leads(id text primary key,assigned_to text);
      create temp table job_sheets(id text primary key,accounting_owner text);
      insert into profiles select 'person-'||i,'Picker Person '||lpad(i::text,3,'0'),'active','sales','private-'||i||'@audit.test' from generate_series(1,250) i;
      insert into profiles values('viewer','Picker Viewer','active','sales','private-viewer@audit.test'),('inactive','Picker Inactive','suspended','sales','private-inactive@audit.test');
      insert into leads values('lead-owned','person-250'),('lead-outside','person-001');
      insert into profiles values('bookkeeper-250','Picker Accountant 250','active','accounting','private-bookkeeper@audit.test'),('bookkeeper-other','Picker Accountant Other','active','accounting','private-other@audit.test'),('bookkeeper-inactive','Picker Accountant Inactive','suspended','accounting','private-inactive-bookkeeper@audit.test');
      insert into job_sheets values('sheet-owned','bookkeeper-250'),('sheet-outside','bookkeeper-other');
    `);
  });
  afterAll(async () => {
    if (holder.client) {
      await holder.client.query("rollback");
      holder.client.release();
    }
    await pool?.end();
  });
  it.runIf(hasDatabase)(
    "searches and resolves person 250 without private directory fields",
    async () => {
      const first = await listAssignableProfiles(
        { purpose: "lead_assign", query: "Picker Person", limit: 100, resourceId: "lead-owned" },
        context(),
      );
      const second = await listAssignableProfiles(
        {
          purpose: "lead_assign",
          query: "Picker Person",
          limit: 100,
          cursor: first.nextCursor!,
          resourceId: "lead-owned",
        },
        context(),
      );
      const third = await listAssignableProfiles(
        {
          purpose: "lead_assign",
          query: "Picker Person",
          limit: 100,
          cursor: second.nextCursor!,
          resourceId: "lead-owned",
        },
        context(),
      );
      expect([first.items.length, second.items.length, third.items.length]).toEqual([100, 100, 50]);
      expect(third.items.at(-1)).toEqual({
        id: "person-250",
        displayName: "Picker Person 250",
        isEligible: true,
        reason: null,
      });
      expect(
        await resolveAssignableProfile(
          { purpose: "lead_assign", id: "person-250", resourceId: "lead-owned" },
          context(),
        ),
      ).toEqual(third.items.at(-1));
      expect(
        await resolveAssignableProfile(
          { purpose: "lead_assign", id: "inactive", resourceId: "lead-owned" },
          context(),
        ),
      ).toBeNull();
      await expect(
        listAssignableProfiles(
          {
            purpose: "lead_assign",
            query: "Different",
            cursor: first.nextCursor!,
            resourceId: "lead-owned",
          },
          context(),
        ),
      ).rejects.toThrow("Invalid people cursor");
    },
  );
  it.runIf(hasDatabase)(
    "limits a manager to their established roster and rejects an outside Lead",
    async () => {
      const page = await listAssignableProfiles(
        { purpose: "lead_assign", query: "Picker", resourceId: "lead-owned" },
        context("manager"),
      );
      expect(page.items.map((row) => row.id).sort()).toEqual(["person-250", "viewer"]);
      await expect(
        listAssignableProfiles(
          { purpose: "lead_assign", resourceId: "lead-outside" },
          context("manager"),
        ),
      ).rejects.toThrow("not authorized");
      expect(
        await resolveAssignableProfile(
          { purpose: "lead_assign", id: "person-249", resourceId: "lead-owned" },
          context("manager"),
        ),
      ).toBeNull();
    },
  );
  it.runIf(hasDatabase)("sales keeps their existing self assignment roster", async () => {
    expect(
      (
        await listAssignableProfiles(
          { purpose: "lead_assign", query: "Picker", resourceId: "lead-owned" },
          context("sales"),
        )
      ).items.map((row) => row.id),
    ).toEqual(["viewer"]);
  });
  it.runIf(hasDatabase).each(["client_success", "accounting", "read_only"] as UserRole[])(
    "%s cannot search or resolve Lead assignment candidates",
    async (role) => {
      await expect(
        listAssignableProfiles({ purpose: "lead_assign", resourceId: "lead-owned" }, context(role)),
      ).rejects.toThrow("not authorized");
      await expect(
        resolveAssignableProfile(
          { purpose: "lead_assign", id: "viewer", resourceId: "lead-owned" },
          context(role),
        ),
      ).rejects.toThrow("not authorized");
    },
  );
  it.runIf(hasDatabase)(
    "honours an exact scoped allow and rejects its expiry and scoped deny",
    async () => {
      const ctx = context("read_only");
      ctx.overrides = [
        {
          profileId: "viewer",
          capability: "leads.update",
          effect: "allow",
          resourceType: "lead",
          resourceId: "lead-owned",
        },
      ];
      expect(
        (
          await listAssignableProfiles({ purpose: "lead_assign", resourceId: "lead-owned" }, ctx)
        ).items.map((row) => row.id),
      ).toEqual(["viewer"]);
      await expect(
        listAssignableProfiles({ purpose: "lead_assign", resourceId: "lead-outside" }, ctx),
      ).rejects.toThrow("not authorized");
      ctx.overrides[0].expiresAt = "2026-09-30T00:00:00Z";
      await expect(
        resolveAssignableProfile(
          { purpose: "lead_assign", id: "viewer", resourceId: "lead-owned" },
          ctx,
        ),
      ).rejects.toThrow("not authorized");
      const admin = context();
      admin.overrides = [
        {
          profileId: "viewer",
          capability: "leads.update",
          effect: "deny",
          resourceType: "lead",
          resourceId: "lead-owned",
        },
      ];
      await expect(
        listAssignableProfiles({ purpose: "lead_assign", resourceId: "lead-owned" }, admin),
      ).rejects.toThrow("not authorized");
    },
  );
  it.runIf(hasDatabase)(
    "Job Sheet owner search and resolution preserve the three writer grants",
    async () => {
      for (const role of ["super_admin", "admin", "accounting"] as UserRole[]) {
        const selected = await resolveAssignableProfile(
          { purpose: "job_sheet_owner", id: "bookkeeper-250", resourceId: "sheet-owned" },
          context(role),
        );
        expect(selected).toEqual({
          id: "bookkeeper-250",
          displayName: "Picker Accountant 250",
          isEligible: true,
          reason: null,
        });
      }
      for (const role of ["manager", "sales", "client_success", "read_only"] as UserRole[]) {
        await expect(
          listAssignableProfiles(
            { purpose: "job_sheet_owner", resourceId: "sheet-owned" },
            context(role),
          ),
        ).rejects.toThrow("not authorized");
        await expect(
          resolveAssignableProfile(
            { purpose: "job_sheet_owner", id: "bookkeeper-250", resourceId: "sheet-owned" },
            context(role),
          ),
        ).rejects.toThrow("not authorized");
      }
    },
  );
  it.runIf(hasDatabase)(
    "Job Sheet exact scoped allow works for search/selected name while neighbours, expiry and deny fail closed",
    async () => {
      const ctx = context("read_only");
      ctx.overrides = [
        {
          profileId: "viewer",
          capability: "job_sheets.update_billing",
          effect: "allow",
          resourceType: "job_sheet",
          resourceId: "sheet-owned",
        },
      ];
      expect(
        (
          await listAssignableProfiles(
            {
              purpose: "job_sheet_owner",
              query: "Picker Accountant 250",
              resourceId: "sheet-owned",
            },
            ctx,
          )
        ).items.map((r) => r.id),
      ).toEqual(["bookkeeper-250"]);
      expect(
        (
          await resolveAssignableProfile(
            { purpose: "job_sheet_owner", id: "bookkeeper-250", resourceId: "sheet-owned" },
            ctx,
          )
        )?.id,
      ).toBe("bookkeeper-250");
      await expect(
        listAssignableProfiles({ purpose: "job_sheet_owner", resourceId: "sheet-outside" }, ctx),
      ).rejects.toThrow("not authorized");
      await expect(listAssignableProfiles({ purpose: "job_sheet_owner" }, ctx)).rejects.toThrow(
        "not authorized",
      );
      ctx.overrides[0].expiresAt = "2026-09-30T00:00:00Z";
      await expect(
        resolveAssignableProfile(
          { purpose: "job_sheet_owner", id: "bookkeeper-250", resourceId: "sheet-owned" },
          ctx,
        ),
      ).rejects.toThrow("not authorized");
      const admin = context();
      admin.overrides = [
        {
          profileId: "viewer",
          capability: "job_sheets.update_billing",
          effect: "deny",
          resourceType: "job_sheet",
          resourceId: "sheet-owned",
        },
      ];
      await expect(
        listAssignableProfiles({ purpose: "job_sheet_owner", resourceId: "sheet-owned" }, admin),
      ).rejects.toThrow("not authorized");
    },
  );
  it.runIf(hasDatabase)(
    "Job Sheet owner roster excludes inactive/non-accounting people and missing resources without private fields",
    async () => {
      const page = await listAssignableProfiles(
        { purpose: "job_sheet_owner", query: "Picker Accountant", resourceId: "sheet-owned" },
        context(),
      );
      expect(page.items.map((r) => r.id)).toEqual(["bookkeeper-250", "bookkeeper-other"]);
      expect(JSON.stringify(page)).not.toContain("private-");
      expect(
        await resolveAssignableProfile(
          { purpose: "job_sheet_owner", id: "bookkeeper-inactive", resourceId: "sheet-owned" },
          context(),
        ),
      ).toBeNull();
      expect(
        await resolveAssignableProfile(
          { purpose: "job_sheet_owner", id: "person-250", resourceId: "sheet-owned" },
          context(),
        ),
      ).toBeNull();
      await expect(
        listAssignableProfiles(
          { purpose: "job_sheet_owner", resourceId: "missing-sheet" },
          context(),
        ),
      ).rejects.toThrow("not authorized");
    },
  );
});
