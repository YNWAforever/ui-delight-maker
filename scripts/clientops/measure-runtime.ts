import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { readInitialJsTransfer } from "./check-route-bundles";

export type RuntimeMeasurement = {
  evidenceType: "runtime_http";
  sha: string;
  environment: "isolated-local";
  dataset: { tasks: number | null; approvals: number | null; source: string };
  route: string;
  role: string;
  cacheState: "warm-and-no-cache-http";
  samples: number;
  coldSamples: number;
  coldNavigationType: "http-no-cache";
  p50Ms: number;
  p95Ms: number;
  dbCount: number | null;
  dbDurationMs: number | null;
  payloadBytes: number;
  initialJsGzipBytes: number;
  queryMetricsCoverage: number;
  metricScope: "http-request" | null;
};

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

export function verifyRuntimeEvidence(value: { evidenceType?: string; [key: string]: unknown }) {
  const failures: string[] = [];
  if (value.evidenceType !== "runtime_http") {
    failures.push("Runtime HTTP evidence is required; synthetic fixture output cannot pass.");
    return failures;
  }
  if (typeof value.samples !== "number" || value.samples < 30)
    failures.push("Need 30 warm HTTP samples.");
  if (typeof value.coldSamples !== "number" || value.coldSamples < 10)
    failures.push("Need 10 no-cache HTTP samples.");
  if (value.coldNavigationType !== "browser-navigation")
    failures.push("Ten cold browser navigations are required; no-cache HTTP is insufficient.");
  const dataset = value.dataset as RuntimeMeasurement["dataset"] | undefined;
  if (
    dataset?.source !== "isolated-postgresql-query" ||
    typeof dataset.tasks !== "number" ||
    dataset.tasks < 10_000 ||
    typeof dataset.approvals !== "number" ||
    dataset.approvals < 100_000
  ) {
    failures.push("Isolated PostgreSQL counts of 10k tasks and 100k approvals are required.");
  }
  if (
    typeof value.dbCount !== "number" ||
    !Number.isFinite(value.dbCount) ||
    value.queryMetricsCoverage !== 1 ||
    value.metricScope !== "http-request"
  ) {
    failures.push("Complete request-scoped DB query metrics are required.");
  }
  if (typeof value.p95Ms !== "number" || value.p95Ms > 800)
    failures.push("Warm HTTP p95 exceeds 800ms or is missing.");
  if (typeof value.payloadBytes !== "number" || value.payloadBytes > 153_600)
    failures.push("Page payload exceeds 150KiB or is missing.");
  if (typeof value.initialJsGzipBytes !== "number" || value.initialJsGzipBytes > 307_200)
    failures.push("Initial JS gzip exceeds 300KiB or is missing.");
  return failures;
}

type Sample = {
  durationMs: number;
  payloadBytes: number;
  dbCount: number | null;
  dbDurationMs: number | null;
  metricScope: string | null;
};

async function takeSample(
  url: URL,
  cookie: string,
  token: string | undefined,
  noCache: boolean,
): Promise<Sample> {
  const requestUrl = new URL(url);
  if (noCache) requestUrl.searchParams.set("_perf", crypto.randomUUID());
  const start = performance.now();
  const response = await fetch(requestUrl, {
    redirect: "manual",
    cache: "no-store",
    headers: {
      Cookie: cookie,
      ...(token ? { "x-clientops-perf-token": token } : {}),
      ...(noCache ? { "Cache-Control": "no-cache" } : {}),
    },
  });
  const payloadBytes = (await response.arrayBuffer()).byteLength;
  const durationMs = performance.now() - start;
  if (response.status !== 200 || response.headers.get("location")?.includes("/login")) {
    throw new Error("Authenticated route response was unavailable");
  }
  const metricScope = response.headers.get("x-clientops-db-scope");
  const countHeader = response.headers.get("x-clientops-db-count");
  const durationHeader = response.headers.get("x-clientops-db-duration-ms");
  const parsedCount = countHeader === null ? null : Number(countHeader);
  const parsedDuration = durationHeader === null ? null : Number(durationHeader);
  return {
    durationMs,
    payloadBytes,
    metricScope,
    dbCount: parsedCount !== null && Number.isFinite(parsedCount) ? parsedCount : null,
    dbDurationMs:
      parsedDuration !== null && Number.isFinite(parsedDuration) ? parsedDuration : null,
  };
}

async function readIsolatedDataset(
  databaseTestUrl: string | undefined,
): Promise<RuntimeMeasurement["dataset"]> {
  if (!databaseTestUrl) return { tasks: null, approvals: null, source: "unavailable" };
  const url = new URL(databaseTestUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error("Dataset measurement is restricted to isolated local PostgreSQL");
  }
  const pool = new Pool({ connectionString: databaseTestUrl, max: 1 });
  try {
    const result = await pool.query<{ tasks: number; approvals: number }>(
      "select (select count(*)::int from tasks) as tasks, (select count(*)::int from human_approvals) as approvals",
    );
    return {
      tasks: result.rows[0].tasks,
      approvals: result.rows[0].approvals,
      source: "isolated-postgresql-query",
    };
  } finally {
    await pool.end();
  }
}

export async function measureRuntimeHttp(config: {
  baseUrl: string;
  cookie: string;
  token?: string;
  route: string;
  role: string;
  manifestPath: string;
  databaseTestUrl?: string;
}): Promise<RuntimeMeasurement> {
  const base = new URL(config.baseUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(base.hostname)) {
    throw new Error("Performance requests are restricted to a local isolated server");
  }
  if (!config.route.startsWith("/") || config.route.startsWith("//"))
    throw new Error("Invalid route");
  const url = new URL(config.route, base);
  const warm: Sample[] = [];
  const cold: Sample[] = [];
  for (let index = 0; index < 30; index++) {
    warm.push(await takeSample(url, config.cookie, config.token, false));
  }
  for (let index = 0; index < 10; index++) {
    cold.push(await takeSample(url, config.cookie, config.token, true));
  }
  const all = [...warm, ...cold];
  const countValues = all.map((sample) => sample.dbCount);
  const durationValues = all.map((sample) => sample.dbDurationMs);
  const dataset = await readIsolatedDataset(config.databaseTestUrl);
  const loginTransfer = readInitialJsTransfer(
    config.manifestPath,
    "src/routes/login.tsx?tsr-split=component",
  );
  return {
    evidenceType: "runtime_http",
    sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    environment: "isolated-local",
    dataset,
    route: config.route,
    role: config.role,
    cacheState: "warm-and-no-cache-http",
    samples: warm.length,
    coldSamples: cold.length,
    coldNavigationType: "http-no-cache",
    p50Ms: percentile(
      warm.map((sample) => sample.durationMs),
      0.5,
    ),
    p95Ms: percentile(
      warm.map((sample) => sample.durationMs),
      0.95,
    ),
    dbCount: countValues.every((value): value is number => value !== null)
      ? Math.max(...(countValues as number[]))
      : null,
    dbDurationMs: durationValues.every((value): value is number => value !== null)
      ? percentile(durationValues as number[], 0.95)
      : null,
    payloadBytes: Math.max(...all.map((sample) => sample.payloadBytes)),
    initialJsGzipBytes: loginTransfer.gzipBytes,
    queryMetricsCoverage:
      all.filter(
        (sample) =>
          sample.metricScope === "http-request" &&
          sample.dbCount !== null &&
          sample.dbDurationMs !== null,
      ).length / all.length,
    metricScope: all.every((sample) => sample.metricScope === "http-request")
      ? "http-request"
      : null,
  };
}

async function main() {
  const mode = process.argv.includes("--mode=verify") ? "verify" : "baseline";
  const baseUrl = process.env.CLIENTOPS_PERF_BASE_URL;
  const cookie = process.env.CLIENTOPS_PERF_COOKIE;
  if (!baseUrl || !cookie) {
    process.stdout.write(
      JSON.stringify({
        evidenceType: "blocked_external",
        mode,
        reason: "Local authenticated performance URL and session cookie are required",
      }) + "\n",
    );
    process.exitCode = mode === "verify" ? 2 : 0;
    return;
  }
  try {
    const result = await measureRuntimeHttp({
      baseUrl,
      cookie,
      token: process.env.CLIENTOPS_PERF_TOKEN,
      route: process.env.CLIENTOPS_PERF_ROUTE ?? "/tasks",
      role: process.env.CLIENTOPS_PERF_ROLE ?? "unspecified",
      manifestPath: process.env.CLIENTOPS_PERF_MANIFEST ?? "dist/client/.vite/manifest.json",
      databaseTestUrl: process.env.DATABASE_TEST_URL,
    });
    const failures = verifyRuntimeEvidence(result);
    process.stdout.write(JSON.stringify({ ...result, mode, failures }, null, 2) + "\n");
    if (mode === "verify" && failures.length > 0) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        evidenceType: "blocked_external",
        mode,
        reason: error instanceof Error ? error.message : "Runtime measurement failed",
      }) + "\n",
    );
    process.exitCode = 2;
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/clientops/measure-runtime.ts")) {
  void main();
}
