import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { Pool, types } from "pg";
// This repo has Node typings; keep the Bun-only adapter API explicit and bounded.
const bunTestSpecifier = "bun:test";
const { mock } = (await import(bunTestSpecifier)) as {
  mock: { module: (path: string, factory: () => Record<string, unknown>) => void };
};
assert.ok(process.versions.bun && typeof mock.module === "function", "Bun runtime required");

/** Real read models / real PostgreSQL. Only the Neon transport is adapted to TCP locally. */
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
assert.ok(Object.keys(args).every((k) => ["runs", "cold", "warm", "config", "out"].includes(k)));
const count = Number(args.runs),
  cold = Number(args.cold ?? 10),
  warm = Number(args.warm ?? 30);
assert.ok(
  [10000, 100000].includes(count) && cold === 10 && warm === 30,
  "Use 10k/100k, 10 cold and 30 warm",
);
const config: unknown = JSON.parse(
  await readFile(resolve(args.config ?? process.env.CLIENTOPS_AI_PERF_CONFIG ?? ""), "utf8"),
);
assert.ok(
  config &&
    typeof config === "object" &&
    "connectionString" in config &&
    "isolationConfirmed" in config &&
    config.isolationConfirmed === true &&
    "sourceRecord" in config &&
    typeof config.sourceRecord === "string" &&
    config.sourceRecord.length > 20,
  "Approved isolated target attestation required",
);
assert.equal(typeof config.connectionString, "string");
const url = new URL(config.connectionString as string);
assert.ok(
  url.hostname === "127.0.0.1" && /^\/clientops_(neon_only|ai_gpt61)_[a-f0-9]+$/.test(url.pathname),
  "Disposable loopback target required",
);
const inspected = spawnSync("docker", ["inspect", "clientops-approval-review-pg-20261001"], {
  encoding: "utf8",
});
assert.equal(inspected.status, 0);
const container = JSON.parse(inspected.stdout)[0];
assert.equal(container.State.Running, true);
assert.equal(container.Config.Image, "pgvector/pgvector:pg17");
assert.ok(
  container.NetworkSettings.Ports["5432/tcp"].some(
    (p: { HostIp: string; HostPort: string }) =>
      p.HostIp === "127.0.0.1" && p.HostPort === url.port,
  ),
);
for (const key of Object.keys(process.env))
  if (/^(SUPABASE|N8N|OPENROUTER|CLIENTOPS_SEED)|BOOTSTRAP/.test(key)) delete process.env[key];
process.env.DATABASE_URL = "";
process.env.DATABASE_TEST_URL = "";
process.env.NEON_AUTH_URL = "https://neon-auth.invalid";
process.env.APP_BASE_URL = "http://localhost:5173";
const dbName = "clientops_ai_perf_" + randomUUID().replaceAll("-", "");
assert.ok(/^clientops_ai_perf_[a-f0-9]{32}$/.test(dbName), "Owned DB required");
const admin = new Pool({ connectionString: url.toString() });
url.pathname = "/" + dbName;
let pool = new Pool({ connectionString: url.toString(), max: 6 });
types.setTypeParser(1700, Number);
let capturing = false,
  queries = 0,
  returned = 0;
const statements = new Map<string, { sql: string; values: readonly unknown[] }>();
const normalize = (value: unknown): unknown =>
  value instanceof Date
    ? value.toISOString()
    : Array.isArray(value)
      ? value.map(normalize)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]))
        : value;
async function query(
  sql: string,
  values: readonly unknown[] = [],
  db?: { query: (s: string, v: unknown[]) => Promise<{ rows: unknown[] }> },
) {
  const result = await (db ?? pool).query(sql, [...values]);
  if (capturing) {
    queries++;
    returned += result.rows.length;
    statements.set(sql, { sql, values: [...values] });
  }
  return normalize(result.rows) as Record<string, unknown>[];
}
mock.module(resolve("src/server/db/neon.server.ts"), () => ({
  query,
  queryOne: async (sql: string, v: readonly unknown[] = []) => (await query(sql, v))[0] ?? null,
  transaction: async (work: (db: unknown) => Promise<unknown>) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await work({
        query: async (sql: string, v: readonly unknown[] = []) => ({
          rows: await query(sql, v, client),
        }),
      });
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
type Rows = unknown;
type Context = {
  session: { profile: Record<string, unknown> };
  actor: Record<string, unknown>;
  overrides: unknown[];
  now: Date;
};
type Authorization = {
  requirePageAuthorization: (
    caps: string[],
    options: { context: Context; cacheRowOwners: boolean },
  ) => Promise<{ access: Record<string, boolean>; rows: Rows }>;
};
type Workspaces = {
  loadAgentDirectoryRead: (access: Record<string, boolean>, rows: Rows) => Promise<unknown>;
  loadAgentHistoryPage: (
    input: Record<string, unknown>,
  ) => Promise<{ items: unknown[]; total: number }>;
};
type Queues = {
  loadAgentQueue: (
    input: Record<string, unknown>,
    ctx: Context,
    rows: Rows,
  ) => Promise<{ items: unknown[]; totalMatching: number }>;
  loadAiReviewQueueRead: (
    input: Record<string, unknown>,
    ctx: Context,
    rows: Rows,
  ) => Promise<{ approvals: unknown[]; pagination: { totalMatching: number } }>;
};
// Variable imports allow the standalone script's strict runtime gate and the app's alias gate.
const load = (path: string) => import(resolve(path));
const auth = (await load("src/server/auth/authorization.server.ts")) as Authorization;
const workspaces = (await load("src/server/read-models/agent-workspaces.ts")) as Workspaces;
const queues = (await load("src/server/read-models/agent-queues.ts")) as Queues;
const { CLIENTOPS_MIGRATION_PATHS } = (await load("src/lib/clientops-relationship-schema.ts")) as {
  CLIENTOPS_MIGRATION_PATHS: string[];
};
const { runClientOpsMigrations } = (await load("src/server/db/clientops-migrations.ts")) as {
  runClientOpsMigrations: (
    db: Pool,
    migrations: { path: string; sql: string }[],
  ) => Promise<unknown>;
};
const migrations = await Promise.all(
  CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
);
const profile = { id: "perf-manager", role: "manager", status: "active" };
const context = (): Context => ({
  session: { profile },
  actor: {
    profileId: profile.id,
    role: profile.role,
    status: profile.status,
    managedTeamIds: [],
    managedDepartmentIds: [],
    directReportIds: ["perf-owner"],
  },
  overrides: [],
  now: new Date(),
});
type Sample = {
  phase: string;
  surface: string;
  limit: number;
  mode: string;
  index: number;
  ms: number;
  queryCount: number;
  rowsReturned: number;
  matchingRows: number;
  payloadBytes: number;
};
const samples: Sample[] = [];
try {
  await admin.query(`create database "${dbName}"`);
  await runClientOpsMigrations(
    pool,
    migrations.filter((m) => !m.path.includes("025_")),
  );
  await pool.query(
    "insert into profiles(id,email,name,role,status) values('perf-manager','manager@fixture.invalid','Synthetic Manager','manager','active'),('perf-owner','owner@fixture.invalid','Synthetic Owner','sales','active')",
  );
  await pool.query("update profiles set manager_profile_id='perf-manager' where id='perf-owner'");
  await pool.query(
    "insert into leads(company_name,assigned_to) select 'Synthetic '||i,'perf-owner' from generate_series(1,$1::int) i",
    [count],
  );
  await pool.query(
    "insert into agent_runs(agent_name,workflow_type,subject_type,subject_id,created_by,status,input_data,output_summary,created_at) select 'Reply Draft','draft_reply','lead',id,'perf-owner','waiting_approval','{\"demo\":true}','Synthetic text only',clock_timestamp()-interval '2 hours' from leads",
  );
  await pool.query(
    "insert into human_approvals(agent_run_id,approval_type,status,assigned_to,context_data,context_summary,created_at) select id,'message_send','pending','perf-owner','{}','Synthetic approval',created_at from agent_runs",
  );
  await pool.query("analyze");
  for (const phase of ["before", "after"]) {
    if (phase === "after") await runClientOpsMigrations(pool, migrations);
    for (const surface of ["ai-ops", "ai-review", "history"])
      for (const limit of [25, 50])
        for (const mode of ["cold-connection", "warm-pool"]) {
          const n = mode === "cold-connection" ? cold : warm;
          for (let i = 0; i < n; i++) {
            if (mode === "cold-connection") {
              await pool.end();
              pool = new Pool({ connectionString: url.toString(), max: 6 });
            }
            const ctx = context();
            queries = 0;
            returned = 0;
            capturing = true;
            const started = performance.now();
            const { access, rows } = await auth.requirePageAuthorization(
              ["agents.view", "approvals.view"],
              { context: ctx, cacheRowOwners: true },
            );
            let value: unknown, matchingRows: number;
            if (surface === "ai-ops") {
              const [directory, queue] = await Promise.all([
                workspaces.loadAgentDirectoryRead(access, rows),
                queues.loadAgentQueue({ queue: "runs", limit }, ctx, rows),
              ]);
              value = { directory, queue };
              matchingRows = queue.totalMatching;
            } else if (surface === "ai-review") {
              const result = await queues.loadAiReviewQueueRead({ limit }, ctx, rows);
              value = result;
              matchingRows = result.pagination.totalMatching;
            } else {
              const result = await workspaces.loadAgentHistoryPage({
                workflowType: "draft_reply",
                page: 1,
                limit,
                access,
                rows,
                recoveryContext: ctx,
              });
              value = result;
              matchingRows = result.total;
            }
            const ms = performance.now() - started;
            capturing = false;
            assert.equal(matchingRows, count);
            samples.push({
              phase,
              surface,
              limit,
              mode,
              index: i,
              ms,
              queryCount: queries,
              rowsReturned: returned,
              matchingRows,
              payloadBytes: Buffer.byteLength(JSON.stringify(value)),
            });
          }
        }
  }
  const plans = [];
  for (const { sql, values } of statements.values()) {
    const plan = await pool.query("explain (analyze,buffers,format json) " + sql, [...values]);
    plans.push({ sql, plan: plan.rows[0]["QUERY PLAN"] });
  }
  const percentile = (v: number[], p: number) =>
    [...v].sort((a, b) => a - b)[Math.ceil(v.length * p) - 1];
  const groups = [
    ...new Set(samples.map((s) => [s.phase, s.surface, s.limit, s.mode].join("/"))),
  ].map((key) => {
    const group = samples.filter((s) => [s.phase, s.surface, s.limit, s.mode].join("/") === key);
    return {
      key,
      n: group.length,
      p50Ms: percentile(
        group.map((s) => s.ms),
        0.5,
      ),
      p95Ms: percentile(
        group.map((s) => s.ms),
        0.95,
      ),
      minQueries: Math.min(...group.map((s) => s.queryCount)),
      maxQueries: Math.max(...group.map((s) => s.queryCount)),
      maxReturnedRows: Math.max(...group.map((s) => s.rowsReturned)),
      maxPayloadBytes: Math.max(...group.map((s) => s.payloadBytes)),
    };
  });
  const comparisons = groups
    .filter((g) => g.key.startsWith("after/") && g.key.endsWith("warm-pool"))
    .map((after) => {
      const before = groups.find((g) => g.key === after.key.replace("after/", "before/"))!;
      return {
        surface: after.key.replace("after/", ""),
        beforeP95: before.p95Ms,
        afterP95: after.p95Ms,
        changePercent: 100 * (after.p95Ms / before.p95Ms - 1),
        gate: after.p95Ms <= before.p95Ms * 1.1 ? "pass" : "owner-review-required",
      };
    });
  const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const diff = spawnSync("git", ["diff", "--", "src", "neon"], { encoding: "utf8" }).stdout;
  const artifact = {
    measuredAt: new Date().toISOString(),
    head,
    workingDiffSha256: createHash("sha256").update(diff).digest("hex"),
    runs: count,
    cold,
    warm,
    seed: "synthetic-manager-owned-leads-v1",
    environment: {
      postgresImage: container.Config.Image,
      loopbackOnly: true,
      node: process.version,
      bun: process.versions.bun,
      transport: "real pg TCP adapter; no DB result mocks",
      coldMeaning: "new connection pool; PostgreSQL caches remain warm",
      scope: "read-model runtime incl row authorization; excludes HTTP/session/browser/provider",
      before: "R08 read models and migrations 001-024",
      after: "same read models with additive migration 025; no index tuning",
      polling: "browser foreground/background acceptance not-tested",
    },
    groups,
    comparisons,
    samples,
    plans,
  };
  const out = resolve(args.out ?? `.clientops-perf/ai-gpt61-20261003/r09-runtime-${count}.json`);
  await mkdir(resolve(out, ".."), { recursive: true });
  await writeFile(out, JSON.stringify(artifact, null, 2) + "\n");
  console.log(JSON.stringify({ out, runs: count, samples: samples.length, groups, comparisons }));
} finally {
  capturing = false;
  await pool.end();
  await admin.query(`drop database if exists "${dbName}"`);
  await admin.end();
}
