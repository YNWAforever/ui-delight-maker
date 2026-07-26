import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACKNOWLEDGED_UNCOVERED_ROUTES, ROUTE_LOADER_CONTRACT } from "../route-loader-contract";

const ROUTES_DIR = new URL("../../../routes/", import.meta.url);

function routesWithLoaders(): string[] {
  return readdirSync(ROUTES_DIR)
    .filter((file) => file.endsWith(".tsx") && !file.startsWith("__"))
    .filter((file) => /^\s*loader:/m.test(readFileSync(new URL(file, ROUTES_DIR), "utf8")))
    .map((file) => file.replace(/\.tsx$/, ""))
    .sort();
}

describe("route loader contract completeness", () => {
  // Without this the new gate rots exactly as the column contract did: it covered only
  // accounts.id while accounts grew to 18 columns, and nobody noticed.
  it("accounts for every route that defines a loader", () => {
    const covered = new Set([
      ...ROUTE_LOADER_CONTRACT.map((entry) => entry.route),
      ...ACKNOWLEDGED_UNCOVERED_ROUTES,
    ]);

    const unaccounted = routesWithLoaders().filter((route) => !covered.has(route));

    expect(
      unaccounted,
      `Add these routes to ROUTE_LOADER_CONTRACT, or to ACKNOWLEDGED_UNCOVERED_ROUTES if ` +
        `coverage is deferred: ${unaccounted.join(", ")}`,
    ).toEqual([]);
  });

  it("does not list a route as both covered and uncovered", () => {
    const covered = ROUTE_LOADER_CONTRACT.map((entry) => entry.route);
    const overlap = covered.filter((route) => ACKNOWLEDGED_UNCOVERED_ROUTES.includes(route));
    expect(overlap).toEqual([]);
  });

  it("does not reference routes that no longer exist", () => {
    const existing = new Set(routesWithLoaders());
    const stale = [
      ...ROUTE_LOADER_CONTRACT.map((entry) => entry.route),
      ...ACKNOWLEDGED_UNCOVERED_ROUTES,
    ].filter((route) => !existing.has(route));
    expect(stale).toEqual([]);
  });
});
