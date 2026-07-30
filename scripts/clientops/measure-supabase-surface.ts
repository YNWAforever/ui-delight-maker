/**
 * Phase 0 of docs/superpowers/specs/2026-07-30-supabase-to-neon-migration.md, in the planning
 * repo. Answers the three questions the migration plan is blocked on, and nothing else.
 *
 * STRICTLY READ-ONLY. Every Supabase call is a `select`, every Neon call is a `select`. There is
 * no insert, update, delete, or DDL anywhere in this file, and it takes no argument that could
 * introduce one. Safe to run against production.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... \
 *     bun scripts/clientops/measure-supabase-surface.ts
 *
 * The service-role key is needed because these tables sit behind RLS and the anon key would
 * report 0 rows for tables that are not empty — which would be the worst possible wrong answer
 * here, since "it's empty, just delete the code" is one of the outcomes being tested for.
 *
 * Output is JSON on stdout plus a human summary on stderr, so it can be piped or read.
 */
import { Pool } from "@neondatabase/serverless";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. The anon key is not sufficient: " +
      "RLS would make non-empty tables report 0 rows.",
  );
}
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required — the identity checks compare against Neon");
}

/** Every Supabase table still read or written by app code, per the spec. */
const SUPABASE_TABLES = [
  "deals",
  "projects",
  "automation_playbooks",
  "automation_runs",
  "customer_success_profiles",
  "engagement_events",
  "contacts",
  "channel_identities",
  "success_touchpoints",
  "tasks",
  "accounts",
  "campaign_members",
] as const;

/** The three names that exist in both databases. */
const COLLISIONS = ["accounts", "tasks", "campaign_members"] as const;

const SAMPLE = 500;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const pool = new Pool({ connectionString: databaseUrl });

type TableCount = { table: string; rows: number | null; error?: string };
type IdentityVerdict = {
  table: string;
  supabaseRows: number | null;
  sampled: number;
  alsoInNeon: number;
  verdict: string;
};

async function countSupabase(table: string): Promise<TableCount> {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return { table, rows: null, error: error.message };
  return { table, rows: count ?? 0 };
}

async function supabaseIds(table: string): Promise<string[]> {
  const { data, error } = await supabase.from(table).select("id").limit(SAMPLE);
  if (error) throw new Error(`Could not read ${table}.id from Supabase: ${error.message}`);
  return (data ?? []).map((row) => String((row as { id: unknown }).id));
}

/**
 * How many of these Supabase ids exist in the Neon table of the same name. Compared as text
 * because the two sides may not agree on the column type, and a uuid cast would throw rather
 * than report a mismatch — throwing looks like a broken script, not like an answer.
 */
async function countInNeon(table: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::int as n from ${table} where id::text = any($1::text[])`,
    [ids],
  );
  return Number(rows[0]?.n ?? 0);
}

function verdictFor(sampled: number, alsoInNeon: number): string {
  if (sampled === 0) return "no rows in Supabase — migrate by deleting the code";
  if (alsoInNeon === 0) return "DISJOINT — two unrelated entity sets, needs a product decision";
  if (alsoInNeon === sampled) return "SAME SET — replicated; migration is a foreign-key repoint";
  return `PARTIAL (${alsoInNeon}/${sampled}) — needs an identity mapping`;
}

const counts: TableCount[] = [];
const identity: IdentityVerdict[] = [];
let orphanDeals: number | null = null;

try {
  for (const table of SUPABASE_TABLES) {
    counts.push(await countSupabase(table));
  }

  for (const table of COLLISIONS) {
    const rows = counts.find((entry) => entry.table === table)?.rows ?? null;
    const ids = rows === 0 ? [] : await supabaseIds(table);
    const alsoInNeon = await countInNeon(table, ids);
    identity.push({
      table,
      supabaseRows: rows,
      sampled: ids.length,
      alsoInNeon,
      verdict: verdictFor(ids.length, alsoInNeon),
    });
  }

  // Q1's second half: deals whose account_id points at no Supabase account at all. Those are
  // already broken today, independent of any migration.
  const { data: dealRows, error: dealError } = await supabase
    .from("deals")
    .select("account_id")
    .limit(SAMPLE);
  if (!dealError && dealRows) {
    const accountIds = new Set((await supabaseIds("accounts")).map(String));
    orphanDeals = dealRows.filter((row) => {
      const id = (row as { account_id: unknown }).account_id;
      return id != null && !accountIds.has(String(id));
    }).length;
  }

  const report = {
    generatedFor: "Phase 0 — 2026-07-30-supabase-to-neon-migration.md",
    readOnly: true,
    supabaseRowCounts: counts,
    dualDatabaseTables: identity,
    dealsWithNoSupabaseAccount: orphanDeals,
    emptyTables: counts.filter((entry) => entry.rows === 0).map((entry) => entry.table),
    unreadableTables: counts.filter((entry) => entry.error).map((entry) => entry.table),
  };
  console.log(JSON.stringify(report, null, 2));

  console.error("\n=== Phase 0 summary ===");
  for (const entry of counts) {
    console.error(
      `  ${entry.table.padEnd(28)} ${entry.error ? `ERROR ${entry.error}` : entry.rows}`,
    );
  }
  console.error("\n  Dual-database tables:");
  for (const entry of identity) {
    console.error(`  ${entry.table.padEnd(28)} ${entry.verdict}`);
  }
  if (orphanDeals !== null) {
    console.error(`\n  deals with an account_id absent from Supabase accounts: ${orphanDeals}`);
  }
  if (report.emptyTables.length > 0) {
    console.error(`\n  Empty — candidates for Phase 1 deletion: ${report.emptyTables.join(", ")}`);
  }
} finally {
  await pool.end();
}
