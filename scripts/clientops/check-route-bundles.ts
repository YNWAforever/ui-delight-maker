import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { ROUTE_PERFORMANCE_BUDGET } from "../../src/lib/performance/route-performance";

type ManifestChunk = {
  file: string;
  src?: string;
  imports?: string[];
  dynamicImports?: string[];
};

type ViteManifest = Record<string, ManifestChunk>;

export type RouteChunkMeasurement = {
  route: string;
  bytes: number;
  files: string[];
};

export type SharedChunkMeasurement = {
  file: string;
  bytes: number;
  routes: string[];
};

export type RouteChunkMeasurements = {
  manifestPath: string;
  routes: RouteChunkMeasurement[];
  shared: SharedChunkMeasurement[];
};

function normalizeSourcePath(value: string) {
  return value.replaceAll("\\", "/").replace(/^\/+/, "");
}

function routeOwner(chunkKey: string, chunk: ManifestChunk) {
  if (chunk.dynamicImports?.includes("src/components/dashboard/dashboard-insights.tsx")) {
    return "dashboard";
  }
  const source = normalizeSourcePath(chunk.src ?? chunkKey);
  const [sourcePath, query = ""] = source.split("?", 2);
  if (query && query !== "tsr-split=component") return null;

  const match = sourcePath.match(/(?:^|\/)src\/routes\/(.+?)\.(?:tsx?|jsx?)$/);
  if (!match) return null;

  const routeFile = match[1]
    .split(".")
    .map((segment) => segment.replace(/_$/, ""))
    .join(".");
  if (routeFile === "index") return "dashboard";
  if (routeFile === "__root") return "shell";
  if (routeFile === "login" || routeFile.startsWith("login.")) return "auth";
  return routeFile.replaceAll(".$", "/:").replaceAll("$", ":").replaceAll(".", "/");
}

function isVendorChunk(chunkKey: string, chunk: ManifestChunk) {
  const source = normalizeSourcePath(chunk.src ?? chunkKey);
  return (
    source.includes("node_modules/") ||
    basename(chunk.file).startsWith("vendor-") ||
    basename(chunkKey).startsWith("_vendor-")
  );
}

function collectChunkKeys(manifest: ViteManifest, rootKey: string) {
  const visited = new Set<string>();
  const pending = [rootKey];
  while (pending.length > 0) {
    const key = pending.pop();
    if (!key || visited.has(key)) continue;
    const chunk = manifest[key];
    if (!chunk) continue;
    visited.add(key);
    pending.push(...(chunk.imports ?? []));
    const source = normalizeSourcePath(chunk.src ?? key);
    if (key === rootKey || !source.includes("node_modules/")) {
      pending.push(...(chunk.dynamicImports ?? []));
    }
  }
  return visited;
}

function outputDirectoryForManifest(manifestPath: string) {
  const manifestDirectory = dirname(manifestPath);
  return basename(manifestDirectory) === ".vite" ? dirname(manifestDirectory) : manifestDirectory;
}

function chunkBytes(outputDirectory: string, chunk: ManifestChunk) {
  const assetPath = resolve(outputDirectory, chunk.file);
  if (!existsSync(assetPath)) {
    throw new Error(`Bundle manifest references missing asset: ${chunk.file}`);
  }
  return statSync(assetPath).size;
}

export function readRouteChunkMeasurements(manifestPath: string): RouteChunkMeasurements {
  const resolvedManifestPath = resolve(manifestPath);
  const manifest = JSON.parse(readFileSync(resolvedManifestPath, "utf8")) as ViteManifest;
  const outputDirectory = outputDirectoryForManifest(resolvedManifestPath);
  const routeChunks = new Map<string, Set<string>>();
  for (const [key, chunk] of Object.entries(manifest)) {
    const route = routeOwner(key, chunk);
    if (!route) continue;
    const chunkKeys = routeChunks.get(route) ?? new Set<string>();
    for (const chunkKey of collectChunkKeys(manifest, key)) chunkKeys.add(chunkKey);
    routeChunks.set(route, chunkKeys);
  }

  const ownersByChunk = new Map<string, Set<string>>();
  for (const [route, chunkKeys] of routeChunks) {
    for (const key of chunkKeys) {
      const owners = ownersByChunk.get(key) ?? new Set<string>();
      owners.add(route);
      ownersByChunk.set(key, owners);
    }
  }

  const isSharedOrVendor = (key: string) => {
    const chunk = manifest[key];
    return Boolean(chunk && ((ownersByChunk.get(key)?.size ?? 0) > 1 || isVendorChunk(key, chunk)));
  };

  const routes = [...routeChunks.entries()]
    .map(([route, chunkKeys]) => {
      const files = [...chunkKeys]
        .filter((key) => !isSharedOrVendor(key))
        .map((key) => manifest[key]?.file)
        .filter((file): file is string => Boolean(file))
        .sort();
      return {
        route,
        bytes: files.reduce((total, file) => total + chunkBytes(outputDirectory, { file }), 0),
        files,
      };
    })
    .sort((left, right) => left.route.localeCompare(right.route));

  const shared = [...ownersByChunk.entries()]
    .filter(([key]) => isSharedOrVendor(key))
    .map(([key, owners]) => ({
      file: manifest[key].file,
      bytes: chunkBytes(outputDirectory, manifest[key]),
      routes: [...owners].sort(),
    }))
    .sort((left, right) => right.bytes - left.bytes);

  return { manifestPath: resolvedManifestPath, routes, shared };
}

export function assertRouteChunkBudgets(measurements: RouteChunkMeasurement[]) {
  const oversized = measurements.filter(
    ({ bytes }) => bytes > ROUTE_PERFORMANCE_BUDGET.maxRouteChunkBytes,
  );
  if (oversized.length === 0) return;

  throw new Error(
    oversized
      .map(
        ({ route, bytes }) =>
          `${route} route owns ${bytes} bytes; budget is ${ROUTE_PERFORMANCE_BUDGET.maxRouteChunkBytes} bytes`,
      )
      .join("\n"),
  );
}

const CLIENT_OUTPUT_SEGMENTS = ["client", "static", "public"] as const;
const SERVER_OUTPUT_SEGMENTS = ["server", "ssr"] as const;

function hasPathSegment(path: string, segments: readonly string[]) {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .some((segment) => segments.includes(segment));
}

/**
 * A route chunk budget describes what a browser downloads, so the client manifest is the only
 * valid input. The build also emits an SSR manifest that lists the same routes but attributes
 * no exclusively-owned chunks to any of them, so measuring it reports 0 bytes per route and
 * every budget assertion passes vacuously. Directory iteration order is not alphabetical, so
 * taking the first manifest found picked between the two at random.
 */
export function selectClientManifest(manifestPaths: readonly string[]) {
  const candidates = [...manifestPaths].sort();
  return (
    candidates.find((path) => hasPathSegment(path, CLIENT_OUTPUT_SEGMENTS)) ??
    candidates.find((path) => !hasPathSegment(path, SERVER_OUTPUT_SEGMENTS)) ??
    null
  );
}

function findBuiltManifest() {
  const explicitPath = process.argv[2];
  if (explicitPath) return resolve(explicitPath);

  for (const outputRoot of [".output", "dist"]) {
    if (!existsSync(outputRoot)) continue;
    const manifests = readdirSync(outputRoot, { recursive: true, withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() && entry.name === "manifest.json" && entry.parentPath.endsWith(".vite"),
      )
      .map((entry) => join(entry.parentPath, entry.name));
    const clientManifest = selectClientManifest(manifests);
    if (clientManifest) return resolve(clientManifest);
    if (manifests.length > 0) {
      throw new Error(
        `Only SSR Vite manifests were found under ${outputRoot} (${[...manifests].sort().join(", ")}). ` +
          "Route chunk budgets need the client manifest — pass its path as the first argument.",
      );
    }
  }
  throw new Error("No Vite client manifest found under .output or dist. Run the Vite build first.");
}

function main() {
  const measurements = readRouteChunkMeasurements(findBuiltManifest());
  process.stdout.write(
    `${JSON.stringify(
      {
        manifestPath: measurements.manifestPath,
        budgetBytes: ROUTE_PERFORMANCE_BUDGET.maxRouteChunkBytes,
        routes: measurements.routes.map(({ route, bytes }) => ({ route, bytes })),
        sharedChunkCount: measurements.shared.length,
        largestSharedChunks: measurements.shared.slice(0, 20),
      },
      null,
      2,
    )}\n`,
  );
  assertRouteChunkBudgets(measurements.routes);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/clientops/check-route-bundles.ts")) {
  main();
}
