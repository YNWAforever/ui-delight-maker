import { describe, expect, it } from "vitest";
import {
  resolveLocalTarget,
  verifyBrowserEvidence,
  type BrowserRuntimeReport,
  type BrowserSample,
} from "../browser-runtime-evidence";

function report(): BrowserRuntimeReport {
  const sample: BrowserSample = {
    kind: "cold",
    readyMs: 100,
    captureMs: 650,
    documentStatus: 200,
    pathMatches: true,
    dataResponses: 2,
    measuredResponses: 2,
    dbCount: 3,
    dbDurationMs: 20,
    dbFailedCount: 0,
    failedRequests: 0,
    blockedRequests: 0,
    payloadBytes: 1000,
    scriptCount: 2,
    jsEncodedBytes: 2000,
    jsTransferBytes: 2400,
  };
  return {
    evidenceType: "runtime_browser",
    environment: "isolated-local",
    sha: "a".repeat(40),
    route: "/tasks",
    routeScopeHash: "b".repeat(64),
    viewport: { width: 1440, height: 900 },
    role: "sales",
    readySelector: "main[data-ready]",
    browserVersion: "chromium-test",
    machine: { platform: "test", arch: "x64", cpu: "test", logicalCpus: 1 },
    dataset: {
      source: "isolated-postgresql-query",
      database: "clientops_perf_contract",
      tasks: 10000,
      approvals: 100000,
    },
    samples: [
      ...Array.from({ length: 10 }, () => ({ ...sample })),
      ...Array.from({ length: 30 }, () => ({ ...sample, kind: "warm" as const })),
    ],
  };
}

describe("browser collector evidence contract (synthetic inputs, not performance proof)", () => {
  it("accepts complete raw navigation evidence", () =>
    expect(verifyBrowserEvidence(report())).toEqual([]));
  it("rejects incomplete cold/warm navigation coverage", () => {
    const value = report();
    value.samples.pop();
    expect(verifyBrowserEvidence(value)).toContain(
      "Need 10 cold browser navigations and 30 warm browser navigations.",
    );
  });
  it("rejects an unmeasured data response, failed SQL, and login redirects", () => {
    const value = report();
    value.samples[0].measuredResponses = 1;
    value.samples[0].dbFailedCount = 1;
    value.samples[0].pathMatches = false;
    expect(verifyBrowserEvidence(value)).toContain(
      "Every navigation needs complete successful request-scoped DB metrics and the requested rendered route.",
    );
  });
  it("includes lazy script bytes in the cold-navigation budget", () => {
    const value = report();
    value.samples[0].jsEncodedBytes = 307201;
    expect(verifyBrowserEvidence(value)).toContain(
      "Cold interactive JS exceeds 300KiB or has missing resource timing.",
    );
  });
  it("rejects NaN timing, missing payload, and blocked network activity", () => {
    const value = report();
    value.samples[0].readyMs = NaN;
    value.samples[1].payloadBytes = -1;
    value.samples[2].blockedRequests = 1;
    expect(verifyBrowserEvidence(value).length).toBeGreaterThan(0);
  });
  it("cannot pass with an undersized dataset or HTTP-only evidence", () => {
    const value = report();
    value.dataset.tasks = 1;
    expect(verifyBrowserEvidence(value).length).toBeGreaterThan(0);
    expect(
      verifyBrowserEvidence({
        ...report(),
        evidenceType: "runtime_http",
      } as unknown as BrowserRuntimeReport).length,
    ).toBeGreaterThan(0);
  });
  it("rejects non-finite response coverage even when the totals appear equal", () => {
    const value = report();
    value.samples[0].dataResponses = Infinity;
    value.samples[0].measuredResponses = Infinity;
    expect(verifyBrowserEvidence(value).length).toBeGreaterThan(0);
  });
  it("keeps both the base and resolved request on loopback without credentials", () => {
    expect(resolveLocalTarget("http://127.0.0.1:5173", "/tasks?status=open").pathname).toBe(
      "/tasks",
    );
    for (const [base, route] of [
      ["https://example.com", "/tasks"],
      ["http://localhost:5173", "//example.com/tasks"],
      ["http://localhost:5173", "/\\example.com/tasks"],
      ["http://user:secret@localhost:5173", "/tasks"],
    ]) {
      expect(() => resolveLocalTarget(base, route)).toThrow();
    }
  });
});
