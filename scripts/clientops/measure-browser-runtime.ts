import { createHash } from "node:crypto";
import { cpus, platform, arch } from "node:os";
import { performance } from "node:perf_hooks";
import { Pool } from "pg";
import { chromium, type Browser, type Page, type Response } from "playwright";
import {
  BrowserMeasurementError,
  resolveLocalTarget,
  summarizeBrowserSamples,
  verifyBrowserEvidence,
  type BrowserSample,
  type BrowserRuntimeReport,
} from "./browser-runtime-evidence.ts";

import { startBrowserReadOnlyProxy } from "./browser-readonly-proxy.ts";

export type BrowserCollectionConfig = {
  baseUrl: string;
  route: string;
  readySelector: string;
  storageStatePath?: string;
  token?: string;
  coldSamples?: number;
  warmSamples?: number;
  timeoutMs?: number;
};

function metric(headers: Record<string, string>, name: string): number | null {
  const raw = headers[name];
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function takeNavigation(
  page: Page,
  target: URL,
  config: BrowserCollectionConfig,
  kind: BrowserSample["kind"],
  guard: { blocked: number },
): Promise<BrowserSample> {
  const sample: BrowserSample = {
    kind,
    readyMs: 0,
    captureMs: 0,
    documentStatus: 0,
    pathMatches: false,
    dataResponses: 0,
    measuredResponses: 0,
    dbCount: 0,
    dbDurationMs: 0,
    dbFailedCount: 0,
    failedRequests: 0,
    blockedRequests: 0,
    payloadBytes: 0,
    scriptCount: 0,
    jsEncodedBytes: 0,
    jsTransferBytes: 0,
  };
  const responseTasks: Promise<void>[] = [];
  const blockedBefore = guard.blocked;
  const onFailed = () => {
    sample.failedRequests++;
  };
  const onResponse = (response: Response) => {
    if (!["document", "xhr", "fetch"].includes(response.request().resourceType())) return;
    sample.dataResponses++;
    responseTasks.push(
      (async () => {
        if (response.status() >= 400) sample.failedRequests++;
        const headers = await response.allHeaders();
        const count = metric(headers, "x-clientops-db-count");
        const duration = metric(headers, "x-clientops-db-duration-ms");
        const failed = metric(headers, "x-clientops-db-failed");
        if (
          headers["x-clientops-db-scope"] === "http-request" &&
          count !== null &&
          Number.isInteger(count) &&
          duration !== null &&
          failed !== null &&
          Number.isInteger(failed)
        ) {
          sample.measuredResponses++;
          sample.dbCount += count;
          sample.dbDurationMs += duration;
          sample.dbFailedCount += failed;
        }
        // Body contents, headers, cookies and URLs are never retained in the report.
        sample.payloadBytes += (await response.body()).byteLength;
      })().catch(() => {
        sample.failedRequests++;
      }),
    );
  };
  page.on("response", onResponse);
  page.on("requestfailed", onFailed);
  const start = performance.now();
  try {
    const response = await page.goto(target.href, {
      waitUntil: "domcontentloaded",
      timeout: config.timeoutMs ?? 15000,
    });
    await page
      .locator(config.readySelector)
      .waitFor({ state: "visible", timeout: config.timeoutMs ?? 15000 });
    sample.readyMs = performance.now() - start;
    // Capture delayed/lazy resources after rendered readiness. The idle wait is
    // separately recorded and is not subtracted into an invented timing result.
    await page.waitForLoadState("networkidle", { timeout: config.timeoutMs ?? 15000 });
    await Promise.all(responseTasks);
    sample.captureMs = performance.now() - start;
    sample.documentStatus = response?.status() ?? 0;
    const final = new URL(page.url());
    sample.pathMatches =
      final.origin === target.origin &&
      final.pathname === target.pathname &&
      final.search === target.search;
    const resources = await page.evaluate(() => {
      const scripts = (
        performance.getEntriesByType("resource") as PerformanceResourceTiming[]
      ).filter((entry) => new URL(entry.name).pathname.endsWith(".js"));
      return {
        scriptCount: scripts.length,
        jsEncodedBytes: scripts.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
        jsTransferBytes: scripts.reduce((sum, entry) => sum + entry.transferSize, 0),
      };
    });
    Object.assign(sample, resources);
    sample.blockedRequests = guard.blocked - blockedBefore;
    return sample;
  } finally {
    page.off("response", onResponse);
    page.off("requestfailed", onFailed);
  }
}

/** Raw collector; its local integration fixture is not ClientOps performance evidence. */
export async function collectBrowserSamples(
  config: BrowserCollectionConfig,
): Promise<{ browserVersion: string; samples: BrowserSample[] }> {
  const target = resolveLocalTarget(config.baseUrl, config.route);
  if (!config.readySelector.trim())
    throw new BrowserMeasurementError("A rendered-readiness selector is required.");
  const coldCount = config.coldSamples ?? 10;
  const warmCount = config.warmSamples ?? 30;
  if (
    ![coldCount, warmCount].every((value) => Number.isInteger(value) && value >= 0 && value <= 100)
  )
    throw new BrowserMeasurementError("Invalid navigation sample count.");
  const proxy = await startBrowserReadOnlyProxy(target.origin);
  let browser: Browser | undefined;
  const samples: BrowserSample[] = [];
  const createContext = () =>
    browser!.newContext({
      storageState: config.storageStatePath,
      serviceWorkers: "block",
      viewport: { width: 1440, height: 900 },
      extraHTTPHeaders: config.token ? { "x-clientops-perf-token": config.token } : {},
    });
  try {
    browser = await chromium.launch({
      headless: true,
      proxy: { server: proxy.url, bypass: "<-loopback>" },
      args: ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
    });
    for (let index = 0; index < coldCount; index++) {
      const context = await createContext();
      try {
        const page = await context.newPage();
        const guard = proxy.guard;
        samples.push(await takeNavigation(page, target, config, "cold", guard));
      } finally {
        await context.close();
      }
    }
    if (warmCount > 0) {
      const context = await createContext();
      try {
        const page = await context.newPage();
        const guard = proxy.guard;
        const warmup = await takeNavigation(page, target, config, "warm", guard);
        if (
          warmup.blockedRequests ||
          warmup.failedRequests ||
          warmup.dbFailedCount ||
          !warmup.pathMatches ||
          warmup.documentStatus !== 200 ||
          warmup.measuredResponses !== warmup.dataResponses
        ) {
          throw new BrowserMeasurementError(
            "Browser cache warm-up did not complete with successful scoped requests.",
          );
        }
        for (let index = 0; index < warmCount; index++)
          samples.push(await takeNavigation(page, target, config, "warm", guard));
      } finally {
        await context.close();
      }
    }
    return { browserVersion: browser.version(), samples };
  } finally {
    try {
      await browser?.close();
    } finally {
      await proxy.close();
    }
  }
}

async function readDataset(connectionString: string): Promise<BrowserRuntimeReport["dataset"]> {
  const url = new URL(connectionString);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^clientops_(perf|t19)_[a-z0-9_]+$/i.test(name)
  ) {
    throw new BrowserMeasurementError(
      "A loopback disposable database named clientops_perf_* or clientops_t19_* is required.",
    );
  }
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
  });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const result = await client.query<{ database: string; tasks: number; approvals: number }>(
        "select current_database() as database, (select count(*)::int from tasks) as tasks, (select count(*)::int from human_approvals) as approvals",
      );
      await client.query("COMMIT");
      if (result.rows[0].database !== name)
        throw new BrowserMeasurementError(
          "Measured database identity does not match the disposable target.",
        );
      return { source: "isolated-postgresql-query", ...result.rows[0] };
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  const env = process.env;
  const required = [
    env.CLIENTOPS_PERF_BASE_URL,
    env.CLIENTOPS_PERF_ROUTE,
    env.CLIENTOPS_PERF_STORAGE_STATE,
    env.CLIENTOPS_PERF_READY_SELECTOR,
    env.CLIENTOPS_PERF_ROLE,
    env.CLIENTOPS_PERF_EXPECTED_SHA,
    env.CLIENTOPS_PERF_TOKEN,
    env.DATABASE_TEST_URL,
  ];
  if (env.CLIENTOPS_PERF_ISOLATED !== "1" || required.some((value) => !value)) {
    console.log(
      JSON.stringify({
        evidenceType: "blocked_external",
        reason:
          "Confirmed isolated server, disposable DB, session state, role, route, readiness selector, expected SHA and diagnostic token are required.",
      }),
    );
    process.exitCode = 2;
    return;
  }
  try {
    const target = resolveLocalTarget(env.CLIENTOPS_PERF_BASE_URL!, env.CLIENTOPS_PERF_ROUTE!);
    const expectedSha = env.CLIENTOPS_PERF_EXPECTED_SHA!;
    if (!/^[a-f0-9]{40}$/.test(expectedSha))
      throw new BrowserMeasurementError("A full candidate commit SHA is required.");
    const response = await fetch(new URL("/api/build", target), {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (
      !response.ok ||
      ((await response.json()) as { commitSha?: string }).commitSha !== expectedSha
    )
      throw new BrowserMeasurementError("Local app build SHA does not match the candidate.");
    const dataset = await readDataset(env.DATABASE_TEST_URL!);
    const result = await collectBrowserSamples({
      baseUrl: target.origin,
      route: target.pathname + target.search,
      storageStatePath: env.CLIENTOPS_PERF_STORAGE_STATE!,
      readySelector: env.CLIENTOPS_PERF_READY_SELECTOR!,
      token: env.CLIENTOPS_PERF_TOKEN!,
      coldSamples: 10,
      warmSamples: 30,
    });
    const finalBuild = await fetch(new URL("/api/build", target), {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (
      !finalBuild.ok ||
      ((await finalBuild.json()) as { commitSha?: string }).commitSha !== expectedSha
    )
      throw new BrowserMeasurementError("Local app build changed during measurement.");
    const report: BrowserRuntimeReport = {
      evidenceType: "runtime_browser",
      environment: "isolated-local",
      sha: expectedSha,
      route: target.pathname,
      routeScopeHash: createHash("sha256")
        .update(target.pathname + target.search)
        .digest("hex"),
      viewport: { width: 1440, height: 900 },
      role: env.CLIENTOPS_PERF_ROLE!,
      readySelector: env.CLIENTOPS_PERF_READY_SELECTOR!,
      dataset,
      machine: {
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0]?.model ?? "unknown",
        logicalCpus: cpus().length,
      },
      ...result,
    };
    const failures = verifyBrowserEvidence(report);
    console.log(
      JSON.stringify(
        { ...report, summary: summarizeBrowserSamples(report.samples), failures },
        null,
        2,
      ),
    );
    process.exitCode = failures.length > 0 ? 1 : 0;
  } catch (error) {
    console.log(
      JSON.stringify({
        evidenceType: "blocked_external",
        reason:
          error instanceof BrowserMeasurementError
            ? error.message
            : "Browser measurement could not complete. Check the isolated environment and local prerequisites.",
      }),
    );
    process.exitCode = 2;
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/clientops/measure-browser-runtime.ts"))
  void main();
