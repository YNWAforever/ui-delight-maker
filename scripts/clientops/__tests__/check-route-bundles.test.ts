import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertLoginInitialJsBudget,
  findClientManifest,
  assertRouteChunkBudgets,
  readRouteChunkMeasurements,
} from "../check-route-bundles";

const temporaryDirectories: string[] = [];

function createManifestFixture() {
  const outputDirectory = mkdtempSync(join(tmpdir(), "clientops-route-bundles-"));
  const manifestDirectory = join(outputDirectory, ".vite");
  const assetsDirectory = join(outputDirectory, "assets");
  mkdirSync(manifestDirectory, { recursive: true });
  mkdirSync(assetsDirectory, { recursive: true });
  temporaryDirectories.push(outputDirectory);

  writeFileSync(join(assetsDirectory, "entry.js"), Buffer.alloc(100_000));
  writeFileSync(join(assetsDirectory, "dashboard.js"), Buffer.alloc(200_000));
  writeFileSync(join(assetsDirectory, "dashboard-insights.js"), Buffer.alloc(1_000));
  writeFileSync(join(assetsDirectory, "reports.js"), Buffer.alloc(300_000));
  writeFileSync(join(assetsDirectory, "quote-pdf.js"), Buffer.alloc(1_000));
  writeFileSync(join(assetsDirectory, "vendor-auth.js"), Buffer.alloc(400_000));
  writeFileSync(
    join(manifestDirectory, "manifest.json"),
    JSON.stringify({
      "_index-dashboard.js": {
        file: "assets/dashboard.js",
        name: "index",
        imports: ["node_modules/app/client.ts", "_vendor-auth.js"],
        dynamicImports: ["src/components/dashboard/dashboard-insights.tsx"],
      },
      "src/components/dashboard/dashboard-insights.tsx": {
        file: "assets/dashboard-insights.js",
        src: "src/components/dashboard/dashboard-insights.tsx",
      },
      "_vendor-auth.js": {
        file: "assets/vendor-auth.js",
      },
      "src/routes/reports.tsx?tsr-split=component": {
        file: "assets/reports.js",
        isEntry: true,
        src: "src/routes/reports.tsx?tsr-split=component",
        imports: ["node_modules/app/client.ts"],
      },
      "src/routes/quotes.$id_.pdf.tsx?tsr-split=component": {
        file: "assets/quote-pdf.js",
        src: "src/routes/quotes.$id_.pdf.tsx?tsr-split=component",
      },
      "node_modules/app/client.ts": {
        file: "assets/entry.js",
        src: "node_modules/app/client.ts",
        dynamicImports: ["_index-dashboard.js", "src/routes/reports.tsx?tsr-split=component"],
      },
    }),
  );

  return join(manifestDirectory, "manifest.json");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("route bundle budgets", () => {
  it("selects the client manifest when a server manifest is present", () => {
    const root = mkdtempSync(join(tmpdir(), "clientops-dual-manifest-"));
    temporaryDirectories.push(root);
    const server = join(root, "dist", "server", ".vite", "manifest.json");
    const client = join(root, "dist", "client", ".vite", "manifest.json");
    mkdirSync(join(root, "dist", "server", ".vite"), { recursive: true });
    mkdirSync(join(root, "dist", "client", ".vite"), { recursive: true });
    writeFileSync(server, "{}");
    writeFileSync(client, "{}");
    expect(findClientManifest(root)).toBe(client);
  });

  it("does not treat a server-only manifest as browser transfer evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "clientops-server-only-"));
    temporaryDirectories.push(root);
    const serverDirectory = join(root, "dist", "server", ".vite");
    mkdirSync(serverDirectory, { recursive: true });
    writeFileSync(join(serverDirectory, "manifest.json"), "{}");
    expect(() => findClientManifest(root)).toThrow(/client manifest/i);
  });

  it("reads emitted route chunk sizes and accepts a route below budget", () => {
    const measurements = readRouteChunkMeasurements(createManifestFixture());

    expect(measurements.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: "dashboard", bytes: 201_000 }),
        expect.objectContaining({ route: "reports", bytes: 300_000 }),
        expect.objectContaining({ route: "quotes/:id/pdf", bytes: 1_000 }),
      ]),
    );
    expect(measurements.shared).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "assets/vendor-auth.js",
          bytes: 400_000,
          routes: ["dashboard"],
        }),
      ]),
    );
    expect(() =>
      assertRouteChunkBudgets(measurements.routes.filter(({ route }) => route === "dashboard")),
    ).not.toThrow();
  });

  it("enforces the actual initial JS gzip budget including shared chunks", () => {
    expect(() =>
      assertLoginInitialJsBudget({
        routeSource: "login",
        files: [],
        bytes: 1_000_000,
        gzipBytes: 307_201,
      }),
    ).toThrow(/Login initial JS/);
  });

  it("rejects an oversized route and identifies its owner and budget", () => {
    const measurements = readRouteChunkMeasurements(createManifestFixture());

    expect(() => assertRouteChunkBudgets(measurements.routes)).toThrow(/reports.*300000.*256000/i);
  });
});
