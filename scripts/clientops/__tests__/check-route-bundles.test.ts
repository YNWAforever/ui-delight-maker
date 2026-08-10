import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertRouteChunkBudgets,
  readRouteChunkMeasurements,
  selectClientManifest,
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

  it("rejects an oversized route and identifies its owner and budget", () => {
    const measurements = readRouteChunkMeasurements(createManifestFixture());

    expect(() => assertRouteChunkBudgets(measurements.routes)).toThrow(/reports.*300000.*256000/i);
  });
});

describe("client manifest selection", () => {
  it("prefers the client manifest regardless of discovery order", () => {
    // The SSR manifest attributes no exclusively-owned chunks, so measuring it would report
    // 0 bytes for every route and let any oversized route through.
    const server = "dist/server/.vite/manifest.json";
    const client = "dist/client/.vite/manifest.json";

    expect(selectClientManifest([server, client])).toBe(client);
    expect(selectClientManifest([client, server])).toBe(client);
  });

  it("recognises the vercel preset's static client output", () => {
    expect(
      selectClientManifest([
        ".output/server/.vite/manifest.json",
        ".output/static/.vite/manifest.json",
      ]),
    ).toBe(".output/static/.vite/manifest.json");
  });

  it("refuses to fall back to an SSR-only manifest set", () => {
    expect(selectClientManifest(["dist/server/.vite/manifest.json"])).toBeNull();
    expect(selectClientManifest([])).toBeNull();
  });

  it("accepts a single unlabelled manifest as the client build", () => {
    expect(selectClientManifest(["dist/.vite/manifest.json"])).toBe("dist/.vite/manifest.json");
  });
});
