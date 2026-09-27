import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const requestHolder = vi.hoisted(() => ({
  request: null as Request | null,
  responseHeaders: new Map<string, string>(),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => requestHolder.request,
  setResponseHeader: (name: string, value: string) =>
    requestHolder.responseHeaders.set(name, value),
}));
import { measureQuery, withQueryMetrics } from "@/server/db/query-metrics.server";
import { readInitialJsTransfer } from "../check-route-bundles";
import { runRoutePerformanceMeasurement } from "../measure-route-performance";
import { verifyRuntimeEvidence } from "../measure-runtime";

const temporaryDirectories: string[] = [];
afterEach(() => {
  delete process.env.CLIENTOPS_PERF_TOKEN;
  requestHolder.request = null;
  requestHolder.responseHeaders.clear();
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("runtime measurement evidence", () => {
  it("counts successful and failed SQL while isolating concurrent requests", async () => {
    const [first, second] = await Promise.all([
      withQueryMetrics(async () => {
        await measureQuery(async () => {
          await new Promise((resolve) => setTimeout(resolve, 15));
          return 1;
        });
        await expect(
          measureQuery(async () => {
            throw new Error("failed SQL");
          }),
        ).rejects.toThrow();
        return "first";
      }),
      withQueryMetrics(async () => {
        await measureQuery(async () => 2);
        return "second";
      }),
    ]);
    expect(first.value).toBe("first");
    expect(first.metrics.queryCount).toBe(2);
    expect(first.metrics.failedQueryCount).toBe(1);
    expect(first.metrics.dbDurationMs).toBeGreaterThan(0);
    expect(second.metrics.queryCount).toBe(1);
    expect(second.metrics.failedQueryCount).toBe(0);
  });

  it("exports aggregate auth and failed-query counts only for a matching request token", async () => {
    process.env.CLIENTOPS_PERF_TOKEN = "local-test-token";
    requestHolder.request = new Request("http://127.0.0.1/login", {
      headers: { "x-clientops-perf-token": "local-test-token" },
    });
    await measureQuery(async () => "auth profile");
    await expect(
      measureQuery(async () => {
        throw new Error("failed SQL");
      }),
    ).rejects.toThrow();
    expect(requestHolder.responseHeaders.get("x-clientops-db-scope")).toBe("http-request");
    expect(requestHolder.responseHeaders.get("x-clientops-db-count")).toBe("2");
    expect(requestHolder.responseHeaders.get("x-clientops-db-failed")).toBe("1");
    requestHolder.request = new Request("http://127.0.0.1/login");
    requestHolder.responseHeaders.clear();
    await measureQuery(async () => "no diagnostic token");
    expect(requestHolder.responseHeaders.size).toBe(0);
  });

  it("includes bootstrap and transitive static chunks but excludes lazy auth UI from initial transfer", () => {
    const root = mkdtempSync(join(tmpdir(), "clientops-runtime-manifest-"));
    temporaryDirectories.push(root);
    mkdirSync(join(root, ".vite"));
    mkdirSync(join(root, "assets"));
    for (const [name, contents] of [
      ["entry.js", "const entry = true;"],
      ["shared.js", "const shared = true;"],
      ["login.js", "const login = true;"],
      ["auth-form.js", "const lazy = true;"],
    ])
      writeFileSync(join(root, "assets", name), contents);
    const manifestPath = join(root, ".vite", "manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        "node_modules/app/client.ts": {
          file: "assets/entry.js",
          dynamicImports: ["src/routes/login.tsx?tsr-split=component"],
        },
        "src/routes/login.tsx?tsr-split=component": {
          file: "assets/login.js",
          imports: ["_shared.js"],
          dynamicImports: ["src/components/auth/login-auth-form.tsx"],
        },
        "_shared.js": { file: "assets/shared.js" },
        "src/components/auth/login-auth-form.tsx": { file: "assets/auth-form.js" },
      }),
    );
    const transfer = readInitialJsTransfer(
      manifestPath,
      "src/routes/login.tsx?tsr-split=component",
    );
    expect(transfer.files).toEqual(["assets/entry.js", "assets/login.js", "assets/shared.js"]);
    expect(transfer.files).not.toContain("assets/auth-form.js");
    expect(transfer.gzipBytes).toBeGreaterThan(0);
  });

  it("cannot certify a runtime gate with synthetic fixture output", () => {
    let text = "";
    const code = runRoutePerformanceMeasurement("verify", (value) => {
      text = value;
    });
    expect(code).not.toBe(0);
    expect(JSON.parse(text).evidenceType).toBe("synthetic");
    expect(verifyRuntimeEvidence({ evidenceType: "synthetic" })).toEqual(
      expect.arrayContaining([expect.stringMatching(/runtime/i)]),
    );
  });
});
