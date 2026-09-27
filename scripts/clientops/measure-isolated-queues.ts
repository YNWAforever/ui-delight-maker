import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { CLIENTOPS_MIGRATION_PATHS } from "../../src/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "../../src/server/db/clientops-migrations";

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

async function main() {
  const connectionString = process.env.DATABASE_TEST_URL;
  if (!connectionString || process.env.CLIENTOPS_PERF_ALLOW_SEED !== "1") {
    throw new Error("Explicit disposable database URL and CLIENTOPS_PERF_ALLOW_SEED=1 required");
  }
  const url = new URL(connectionString);
  if (
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    !url.pathname.slice(1).startsWith("clientops_t19_")
  ) {
    throw new Error("Performance seeding is restricted to a local clientops_t19_ database");
  }
  const pool = new Pool({ connectionString, max: 4 });
  try {
    await runClientOpsMigrations(
      pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
    const existing = await pool.query<{ tasks: number; approvals: number }>(
      "select (select count(*)::int from tasks) as tasks, (select count(*)::int from human_approvals) as approvals",
    );
    if (existing.rows[0].tasks !== 0 || existing.rows[0].approvals !== 0) {
      throw new Error("Performance seeding requires an empty disposable database");
    }
    await pool.query(
      "insert into profiles(id,email,name,role,status) values('t19-admin','t19-admin@example.test','Admin','admin','active') on conflict(id) do nothing",
    );
    await pool.query(
      "insert into tasks(title,assigned_to,status,priority,created_at) select 'T19 task ' || n,'t19-admin','open','medium',now()-((10000-n) || ' seconds')::interval from generate_series(1,10000) n",
    );
    await pool.query(
      "insert into human_approvals(approval_type,assigned_to,status,context_summary,created_at) select 'message_send','t19-admin','pending','T19 approval ' || n,now()-((100000-n) || ' seconds')::interval from generate_series(1,100000) n",
    );
    await pool.query("analyze tasks");
    await pool.query("analyze human_approvals");
    const dataset = await pool.query<{ tasks: number; approvals: number }>(
      "select (select count(*)::int from tasks) as tasks, (select count(*)::int from human_approvals) as approvals",
    );
    const measures = [];
    for (const [name, countSql, pageSql] of [
      [
        "tasks",
        "select count(*)::int as total from tasks where status='open'",
        "select id,title,assigned_to,status,priority,created_at from tasks where status='open' order by created_at desc,id desc limit 50",
      ],
      [
        "approvals",
        "select count(*)::int as total from human_approvals where status in ('pending','escalated')",
        "select id,approval_type,assigned_to,status,context_summary,created_at from human_approvals where status in ('pending','escalated') order by created_at desc,id desc limit 50",
      ],
    ] as const) {
      const durations: number[] = [];
      let payloadBytes = 0;
      let pageRows = 0;
      for (let sample = 0; sample < 30; sample++) {
        const started = performance.now();
        const count = await pool.query(countSql);
        const page = await pool.query(pageSql);
        durations.push(performance.now() - started);
        pageRows = page.rows.length;
        payloadBytes = Buffer.byteLength(
          JSON.stringify({ total: count.rows[0].total, items: page.rows }),
          "utf8",
        );
      }
      measures.push({
        component: name + "-sql-list-count",
        samples: durations.length,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        pageRows,
        payloadBytes,
        queryCountPerSample: 2,
      });
    }
    process.stdout.write(
      JSON.stringify(
        {
          evidenceType: "isolated_postgresql_component_runtime",
          sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
          dataset: dataset.rows[0],
          environment: "local-disposable-postgresql",
          caveat: "Direct SQL list/count component timing; excludes auth, HTTP, browser and cache",
          measures,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message + "\n" : "Performance run failed\n");
  process.exitCode = 1;
});
