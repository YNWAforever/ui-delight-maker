export type BrowserSample = {
  kind: "cold" | "warm";
  readyMs: number;
  captureMs: number;
  documentStatus: number;
  pathMatches: boolean;
  dataResponses: number;
  measuredResponses: number;
  dbCount: number;
  dbDurationMs: number;
  dbFailedCount: number;
  failedRequests: number;
  blockedRequests: number;
  payloadBytes: number;
  scriptCount: number;
  jsEncodedBytes: number;
  jsTransferBytes: number;
};

export type BrowserRuntimeReport = {
  evidenceType: "runtime_browser";
  environment: "isolated-local";
  sha: string;
  route: string;
  routeScopeHash: string;
  viewport: { width: number; height: number };
  role: string;
  readySelector: string;
  browserVersion: string;
  machine: { platform: string; arch: string; cpu: string; logicalCpus: number };
  dataset: {
    source: "isolated-postgresql-query";
    database: string;
    tasks: number;
    approvals: number;
  };
  samples: BrowserSample[];
};

export class BrowserMeasurementError extends Error {}

export function resolveLocalTarget(baseUrl: string, route: string): URL {
  const base = new URL(baseUrl);
  const local = ["127.0.0.1", "localhost", "[::1]"];
  if (
    !local.includes(base.hostname) ||
    base.protocol !== "http:" ||
    base.username ||
    base.password
  ) {
    throw new BrowserMeasurementError(
      "Browser measurement requires a loopback HTTP server without URL credentials.",
    );
  }
  if (!route.startsWith("/") || route.startsWith("//") || route.includes("\\")) {
    throw new BrowserMeasurementError("Browser measurement requires a local route path.");
  }
  const target = new URL(route, base);
  if (target.origin !== base.origin)
    throw new BrowserMeasurementError("Browser route must remain on the configured local origin.");
  return target;
}

function nonnegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}
function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? NaN;
}

export function summarizeBrowserSamples(samples: BrowserSample[]) {
  const cold = samples.filter((sample) => sample.kind === "cold");
  const warm = samples.filter((sample) => sample.kind === "warm");
  return {
    coldNavigations: cold.length,
    warmNavigations: warm.length,
    warmReadyP50Ms: percentile(
      warm.map((sample) => sample.readyMs),
      0.5,
    ),
    warmReadyP95Ms: percentile(
      warm.map((sample) => sample.readyMs),
      0.95,
    ),
    coldReadyP95Ms: percentile(
      cold.map((sample) => sample.readyMs),
      0.95,
    ),
    dbDurationP95Ms: percentile(
      samples.map((sample) => sample.dbDurationMs),
      0.95,
    ),
    maxPayloadBytes: Math.max(...samples.map((sample) => sample.payloadBytes)),
    maxColdJsEncodedBytes: Math.max(...cold.map((sample) => sample.jsEncodedBytes)),
  };
}

export function verifyBrowserEvidence(report: BrowserRuntimeReport): string[] {
  const failures: string[] = [];
  if (
    report.evidenceType !== "runtime_browser" ||
    report.environment !== "isolated-local" ||
    !/^[a-f0-9]{40}$/.test(report.sha)
  ) {
    failures.push(
      "Real isolated browser navigation evidence and a verified build SHA are required.",
    );
  }
  const summary = summarizeBrowserSamples(report.samples);
  if (
    summary.coldNavigations !== 10 ||
    summary.warmNavigations !== 30 ||
    report.samples.length !== 40
  ) {
    failures.push("Need 10 cold browser navigations and 30 warm browser navigations.");
  }
  if (
    report.dataset.source !== "isolated-postgresql-query" ||
    !/^clientops_(perf|t19)_/i.test(report.dataset.database) ||
    !nonnegative(report.dataset.tasks) ||
    report.dataset.tasks < 10000 ||
    !nonnegative(report.dataset.approvals) ||
    report.dataset.approvals < 100000
  ) {
    failures.push(
      "Verified disposable PostgreSQL counts of 10k tasks and 100k approvals are required.",
    );
  }
  if (
    report.samples.some(
      (sample) =>
        sample.documentStatus !== 200 ||
        !sample.pathMatches ||
        sample.dataResponses < 1 ||
        !Number.isInteger(sample.dataResponses) ||
        !Number.isInteger(sample.measuredResponses) ||
        sample.measuredResponses !== sample.dataResponses ||
        !Number.isInteger(sample.dbCount) ||
        !nonnegative(sample.dbCount) ||
        !nonnegative(sample.dbDurationMs) ||
        sample.dbFailedCount !== 0 ||
        sample.failedRequests !== 0 ||
        sample.blockedRequests !== 0,
    )
  ) {
    failures.push(
      "Every navigation needs complete successful request-scoped DB metrics and the requested rendered route.",
    );
  }
  if (
    report.samples.some(
      (sample) => !nonnegative(sample.readyMs) || !nonnegative(sample.captureMs),
    ) ||
    !nonnegative(summary.warmReadyP95Ms) ||
    summary.warmReadyP95Ms > 800
  ) {
    failures.push("Warm rendered-readiness p95 exceeds 800ms or has invalid timing.");
  }
  if (
    report.samples.some(
      (sample) => !nonnegative(sample.payloadBytes) || sample.payloadBytes > 153600,
    )
  ) {
    failures.push("Document and data payload exceeds 150KiB or is invalid.");
  }
  if (
    report.samples
      .filter((sample) => sample.kind === "cold")
      .some(
        (sample) =>
          !Number.isInteger(sample.scriptCount) ||
          sample.scriptCount < 1 ||
          !nonnegative(sample.jsEncodedBytes) ||
          sample.jsEncodedBytes === 0 ||
          sample.jsEncodedBytes > 307200 ||
          !nonnegative(sample.jsTransferBytes),
      )
  ) {
    failures.push("Cold interactive JS exceeds 300KiB or has missing resource timing.");
  }
  return failures;
}
