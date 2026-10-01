import { Pool } from "pg";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ client: null as PoolClient | null }));
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = []) =>
    (await holder.client!.query(sql, [...values])).rows,
  queryOne: async (sql: string, values: readonly unknown[] = []) =>
    (await holder.client!.query(sql, [...values])).rows[0] ?? null,
}));
import { getLeadWorkspaceData, listLeadsPage } from "../leads";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
let pool: Pool | null = null;

describe("lead owner display on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 1 });
    holder.client = await pool.connect();
    await holder.client.query("begin");
    // Real SQL and one connection; temporary tables isolate this read contract from other suites.
    await holder.client.query(`
      create temporary table profiles(id text primary key, name text, email text, status text);
      create temporary table leads(
        id text primary key, contact_id text, account_id text, source_campaign_id text,
        campaign_member_id text, company_name text, contact_name text, contact_email text,
        contact_phone text, source text, status text, assigned_to text, lead_score int,
        qualification_data jsonb, enquiry_text text, created_at timestamptz, updated_at timestamptz
      );
      create temporary table activity_logs(
        id text, actor_type text, actor_id text, actor_name text, action text,
        object_type text, object_id text, diff_data jsonb, created_at timestamptz
      );
      create temporary table quotes(
        id text, number text, status text, total_value numeric, currency text,
        valid_until date, created_at timestamptz, lead_id text
      );
      create temporary table quote_line_items(id text, quote_id text);
    `);
  });
  beforeEach(async () => {
    if (!hasDatabase) return;
    await holder.client!.query("truncate leads, profiles");
    await holder.client!.query(`
      insert into profiles(id,name,email,status)
      select 'sales-text-profile-' || i, 'Synthetic owner ' || i,
        'private-' || i || '@audit.test', 'active'
      from generate_series(1,250) i;
      insert into leads(id,company_name,assigned_to)
      values('owned-lead','Synthetic lead','sales-text-profile-250');
    `);
  });
  afterAll(async () => {
    if (holder.client) {
      await holder.client.query("rollback");
      holder.client.release();
    }
    await pool?.end();
  });

  it.skipIf(!hasDatabase)(
    "resolves a text profile beyond the first page without directory fields",
    async () => {
      const { lead } = await getLeadWorkspaceData("owned-lead");
      expect(lead).toMatchObject({
        assigned_to: "sales-text-profile-250",
        owner_display_name: "Synthetic owner 250",
      });
      expect(lead).not.toHaveProperty("email");
      expect(lead).not.toHaveProperty("role");
      expect(lead).not.toHaveProperty("owner_email");
      expect(lead).not.toHaveProperty("owner_status");
      expect(lead.status).toBeNull();
    },
  );
  it.skipIf(!hasDatabase)(
    "uses the current name of an inactive historical owner and keeps ownership",
    async () => {
      await holder.client!.query(
        "update profiles set name='  Renamed owner  ', status='inactive' where id=$1",
        ["sales-text-profile-250"],
      );
      const { lead } = await getLeadWorkspaceData("owned-lead");
      expect(lead).toMatchObject({
        assigned_to: "sales-text-profile-250",
        owner_display_name: "Renamed owner",
      });
      expect(
        (await holder.client!.query("select assigned_to from leads")).rows[0].assigned_to,
      ).toBe("sales-text-profile-250");
    },
  );
  it.skipIf(!hasDatabase)("represents a blank owner name as unavailable", async () => {
    await holder.client!.query("update profiles set name='   ' where id=$1", [
      "sales-text-profile-250",
    ]);
    expect((await getLeadWorkspaceData("owned-lead")).lead).toMatchObject({
      assigned_to: "sales-text-profile-250",
      owner_display_name: null,
    });
  });
  it.skipIf(!hasDatabase)("preserves an orphan owner while returning no display name", async () => {
    await holder.client!.query("delete from profiles where id=$1", ["sales-text-profile-250"]);
    expect((await getLeadWorkspaceData("owned-lead")).lead).toMatchObject({
      assigned_to: "sales-text-profile-250",
      owner_display_name: null,
    });
  });
  it.skipIf(!hasDatabase)(
    "distinguishes an unassigned lead from a missing owner name",
    async () => {
      await holder.client!.query("update leads set assigned_to=null");
      expect((await getLeadWorkspaceData("owned-lead")).lead).toMatchObject({
        assigned_to: null,
        owner_display_name: null,
      });
    },
  );
  it.skipIf(!hasDatabase)(
    "hydrates a paged owner beyond the roster first page with filters and stable counts",
    async () => {
      await holder.client!.query(
        "update leads set status='new', source='website', created_at=now()",
      );
      const page = await listLeadsPage({
        status: "new",
        source: "website",
        assigned_to: "sales-text-profile-250",
        page: 1,
        limit: 1,
      });
      expect(page).toMatchObject({
        total: 1,
        page: 1,
        limit: 1,
        items: [
          { assigned_to: "sales-text-profile-250", owner_display_name: "Synthetic owner 250" },
        ],
      });
      expect(page.items[0]).not.toHaveProperty("owner_email");
      expect(page.items[0]).not.toHaveProperty("owner_status");
      expect((await listLeadsPage({ status: "qualified" })).items).toEqual([]);
    },
  );
  it.skipIf(!hasDatabase)(
    "preserves missing, blank and inactive list owners without changing persisted ownership",
    async () => {
      for (const mode of ["inactive", "blank", "orphan", "unassigned"]) {
        if (mode === "inactive")
          await holder.client!.query(
            "update profiles set name='  Renamed owner  ',status='inactive' where id='sales-text-profile-250'",
          );
        if (mode === "blank")
          await holder.client!.query(
            "update profiles set name=' ' where id='sales-text-profile-250'",
          );
        if (mode === "orphan")
          await holder.client!.query("delete from profiles where id='sales-text-profile-250'");
        if (mode === "unassigned") await holder.client!.query("update leads set assigned_to=null");
        const page = await listLeadsPage();
        expect(page.total).toBe(1);
        expect(page.items[0]).toMatchObject({
          assigned_to: mode === "unassigned" ? null : "sales-text-profile-250",
          owner_display_name: mode === "inactive" ? "Renamed owner" : null,
        });
      }
    },
  );
  it.skipIf(!hasDatabase)("keeps the existing missing lead error", async () => {
    await expect(getLeadWorkspaceData("missing-lead")).rejects.toThrow("Lead not found");
  });
});
