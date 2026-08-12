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
 * SAMPLED, AND IT SAYS SO. Row counts are exact. The id-overlap checks read at most `SAMPLE`
 * ids per table, so they can only state a whole-table verdict ("SAME SET", "DISJOINT") when the
 * sample covered the whole table; otherwise they hedge and name the denominator. Anything the
 * report could not settle is listed under `incompleteVerdicts`. This matters because two of the
 * outcomes here authorise deleting application code.
 *
 * Output is JSON on stdout plus a human summary on stderr, so it can be piped or read.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The env this needs, or a thrown explanation of what is missing.
 *
 * A function rather than module-level statements so the pure reporting logic below can be
 * imported and tested without credentials — the same entrypoint pattern
 * `bootstrap-super-admin.ts` uses. The guards themselves are unchanged and still run before any
 * client is constructed.
 */
export function readMeasurementEnv(env: NodeJS.ProcessEnv = process.env) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = env.DATABASE_URL;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. The anon key is not sufficient: " +
        "RLS would make non-empty tables report 0 rows.",
    );
  }
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required — the identity checks compare against Neon");
  }

  return { supabaseUrl, serviceRoleKey, databaseUrl };
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

export const SAMPLE = 500;

type TableCount = { table: string; rows: number | null; error?: string };
type IdentityVerdict = {
  table: string;
  supabaseRows: number | null;
  sampled: number;
  /** Whether `sampled` covers every row, which is what a set-level verdict requires. */
  complete: boolean;
  alsoInNeon: number;
  verdict: string;
  error?: string;
};

async function countSupabase(supabase: SupabaseClient, table: string): Promise<TableCount> {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return { table, rows: null, error: error.message };
  return { table, rows: count ?? 0 };
}

/**
 * Up to `SAMPLE` ids, ordered, so two runs against an unchanged database sample the same rows.
 * PostgREST leaves the order of an unordered select unspecified, which made the verdicts below
 * non-reproducible as well as partial.
 */
async function supabaseIds(supabase: SupabaseClient, table: string): Promise<string[]> {
  const { data, error } = await supabase.from(table).select("id").order("id").limit(SAMPLE);
  if (error) throw new Error(`Could not read ${table}.id from Supabase: ${error.message}`);
  return (data ?? []).map((row) => String((row as { id: unknown }).id));
}

/**
 * How many of these Supabase ids exist in the Neon table of the same name. Compared as text
 * because the two sides may not agree on the column type, and a uuid cast would throw rather
 * than report a mismatch — throwing looks like a broken script, not like an answer.
 */
async function countInNeon(pool: Pool, table: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::int as n from ${table} where id::text = any($1::text[])`,
    [ids],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * What the overlap between the two databases means for the migration.
 *
 * `complete` is load-bearing. "SAME SET" and "DISJOINT" are claims about the whole table, and
 * this only ever looks at `SAMPLE` rows, so they may only be stated when the sample *is* the
 * table. Without that guard a 20,000-row table whose first 500 ids happened to be backfilled
 * reported "SAME SET — replicated", and one whose first 500 happened not to be reported
 * "DISJOINT — two unrelated entity sets" — the second of which licenses deleting the code.
 * Every string carries its denominator so a reader cannot mistake a sample for a census.
 */
export function verdictFor(input: {
  sampled: number;
  alsoInNeon: number;
  complete: boolean;
}): string {
  const { sampled, alsoInNeon, complete } = input;
  if (sampled === 0) return "no rows in Supabase — migrate by deleting the code";

  const scope = complete ? `all ${sampled} rows` : `${sampled} of the table sampled`;

  if (alsoInNeon === sampled) {
    return complete
      ? `SAME SET (${sampled}/${sampled}) — replicated; migration is a foreign-key repoint`
      : `CONSISTENT WITH SAME SET (${alsoInNeon}/${sampled}, ${scope}) — re-run with a larger SAMPLE to confirm`;
  }

  if (alsoInNeon === 0) {
    return complete
      ? `DISJOINT (0/${sampled}) — two unrelated entity sets, needs a product decision`
      : `CONSISTENT WITH DISJOINT (0/${sampled}, ${scope}) — re-run with a larger SAMPLE before acting on this`;
  }

  return `PARTIAL (${alsoInNeon}/${sampled}, ${scope}) — needs an identity mapping`;
}

/**
 * Deals whose `account_id` matches no Supabase account — already broken today, independent of
 * any migration.
 *
 * This checks the accounts the sampled deals actually reference, rather than comparing a sample
 * of deals against a *separate* sample of accounts. The previous form asked "is this deal's
 * account among an arbitrary 500 accounts?", so on any tenant with more than 500 accounts it
 * reported almost every deal as an orphan: 5,000 accounts and 400 sound deals produced roughly
 * 360 false orphans. The number is exact for the deals examined, and the report says how many
 * that was.
 */
async function measureOrphanDeals(supabase: SupabaseClient): Promise<{
  sampled: number;
  complete: boolean;
  orphans: number;
  orphanAccountIds: string[];
} | null> {
  const { data, error, count } = await supabase
    .from("deals")
    .select("account_id", { count: "exact" })
    .order("account_id")
    .limit(SAMPLE);
  if (error || !data) return null;

  const referenced = [
    ...new Set(
      data
        .map((row) => (row as { account_id: unknown }).account_id)
        .filter((id): id is string => id != null)
        .map(String),
    ),
  ];
  if (referenced.length === 0) {
    return {
      sampled: data.length,
      complete: (count ?? data.length) <= data.length,
      orphans: 0,
      orphanAccountIds: [],
    };
  }

  // Chunked so a wide `in` list cannot outgrow the PostgREST request URL.
  const present = new Set<string>();
  const CHUNK = 100;
  for (let index = 0; index < referenced.length; index += CHUNK) {
    const chunk = referenced.slice(index, index + CHUNK);
    const { data: accountRows, error: accountError } = await supabase
      .from("accounts")
      .select("id")
      .in("id", chunk);
    if (accountError) throw new Error(`Could not resolve deal accounts: ${accountError.message}`);
    for (const row of accountRows ?? []) present.add(String((row as { id: unknown }).id));
  }

  const orphanAccountIds = referenced.filter((id) => !present.has(id));
  const orphans = data.filter((row) => {
    const id = (row as { account_id: unknown }).account_id;
    return id != null && !present.has(String(id));
  }).length;

  return {
    sampled: data.length,
    complete: (count ?? data.length) <= data.length,
    orphans,
    orphanAccountIds,
  };
}

/**
 * Runs every measurement and prints the report. Exported so a caller can drive it with its own
 * clients; the entrypoint below supplies real ones from the environment.
 */
export async function measureSupabaseSurface(supabase: SupabaseClient, pool: Pool) {
  const counts: TableCount[] = [];
  const identity: IdentityVerdict[] = [];
  let orphans: Awaited<ReturnType<typeof measureOrphanDeals>> = null;

  try {
    for (const table of SUPABASE_TABLES) {
      counts.push(await countSupabase(supabase, table));
    }

    for (const table of COLLISIONS) {
      const rows = counts.find((entry) => entry.table === table)?.rows ?? null;

      // One unreadable table used to throw out of the loop and discard the entire report, so a
      // renamed table or a grant difference produced no output at all rather than the answers for
      // every other table.
      let ids: string[];
      try {
        ids = rows === 0 ? [] : await supabaseIds(supabase, table);
      } catch (error) {
        identity.push({
          table,
          supabaseRows: rows,
          sampled: 0,
          complete: false,
          alsoInNeon: 0,
          verdict: "UNREADABLE — could not sample ids, see error",
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      const alsoInNeon = await countInNeon(pool, table, ids);
      const complete = rows !== null && ids.length >= rows;
      identity.push({
        table,
        supabaseRows: rows,
        sampled: ids.length,
        complete,
        alsoInNeon,
        verdict: verdictFor({ sampled: ids.length, alsoInNeon, complete }),
      });
    }

    orphans = await measureOrphanDeals(supabase);

    const report = {
      generatedFor: "Phase 0 — 2026-07-30-supabase-to-neon-migration.md",
      readOnly: true,
      sampleLimit: SAMPLE,
      supabaseRowCounts: counts,
      dualDatabaseTables: identity,
      // Reported as an object rather than a bare number so the denominator travels with it: the
      // count is exact for the deals examined, and `complete` says whether that was all of them.
      orphanDeals: orphans
        ? {
            sampled: orphans.sampled,
            complete: orphans.complete,
            withNoSupabaseAccount: orphans.orphans,
            missingAccountIds: orphans.orphanAccountIds.slice(0, 20),
          }
        : null,
      emptyTables: counts.filter((entry) => entry.rows === 0).map((entry) => entry.table),
      unreadableTables: counts.filter((entry) => entry.error).map((entry) => entry.table),
      incompleteVerdicts: identity
        .filter((entry) => !entry.complete && entry.sampled > 0)
        .map((entry) => entry.table),
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
    if (orphans) {
      const scope = orphans.complete ? "all deals" : `${orphans.sampled} deals sampled`;
      console.error(
        `\n  deals with an account_id absent from Supabase accounts: ${orphans.orphans} (of ${scope})`,
      );
    }
    if (report.incompleteVerdicts.length > 0) {
      console.error(
        `\n  Verdicts above are from a ${SAMPLE}-row sample, not a census, for: ` +
          `${report.incompleteVerdicts.join(", ")}. Raise SAMPLE before acting on them.`,
      );
    }
    if (report.emptyTables.length > 0) {
      console.error(
        `\n  Empty — candidates for Phase 1 deletion: ${report.emptyTables.join(", ")}`,
      );
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  const env = readMeasurementEnv();
  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const pool = new Pool({ connectionString: env.databaseUrl });

  await measureSupabaseSurface(supabase, pool);
}

const entrypoint = process.argv[1];
if (entrypoint && resolve(entrypoint) === fileURLToPath(import.meta.url)) {
  await main();
}
