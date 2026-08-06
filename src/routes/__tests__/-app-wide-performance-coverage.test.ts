import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ROUTE_BROWSER_SCENARIOS,
  measureRouteBrowserScenarios,
  measureRoutePerformance,
} from "../../../scripts/clientops/measure-route-performance";
import { APP_ROUTE_FAMILIES } from "@/lib/performance/route-performance";

const normalizeRoutePath = (path: string) => (path.length > 1 ? path.replace(/\/$/, "") : path);

function generatedUserRoutes() {
  const routeTree = readFileSync(new URL("../../routeTree.gen.ts", import.meta.url), "utf8");
  return [
    ...new Set(
      [...routeTree.matchAll(/fullPath: '([^']+)'/g)]
        .map((match) => normalizeRoutePath(match[1]))
        .filter((path) => !path.startsWith("/api/")),
    ),
  ].sort();
}

describe("app-wide performance completion coverage", () => {
  it("maps every generated user-facing route to exactly one route family", () => {
    const ownership = generatedUserRoutes().map((route) => ({
      route,
      owners: APP_ROUTE_FAMILIES.filter((family) =>
        family.paths.map(normalizeRoutePath).includes(route),
      ).map((family) => family.id),
    }));

    expect(ownership.filter(({ owners }) => owners.length === 0)).toEqual([]);
    expect(ownership.filter(({ owners }) => owners.length > 1)).toEqual([]);
  });

  it("covers every family with all fixture and browser scenarios", () => {
    const measurements = measureRoutePerformance();
    const browserMeasurements = measureRouteBrowserScenarios();
    const fixtures = ["empty", "typical", "high-activity"];

    const missingMeasurementScenarios = APP_ROUTE_FAMILIES.flatMap((family) => [
      ...fixtures
        .filter(
          (fixture) =>
            !measurements.some(
              (measurement) =>
                measurement.routeFamily === family.id && measurement.fixture === fixture,
            ),
        )
        .map((fixture) => `${family.id}:fixture:${fixture}`),
      ...ROUTE_BROWSER_SCENARIOS.filter(
        (scenario) =>
          !browserMeasurements.some(
            (measurement) =>
              measurement.routeFamily === family.id && measurement.scenario === scenario,
          ),
      ).map((scenario) => `${family.id}:browser:${scenario}`),
    ]);

    expect(missingMeasurementScenarios).toEqual([]);
  });

  it("keeps user-facing mutation refreshes scoped to query families", () => {
    // A whole-router invalidate refetches every mounted loader, so mutations are expected to
    // pass a filter. Comments and string literals are stripped first: this scans source text,
    // and without that a route merely *describing* the anti-pattern in a comment failed the
    // check while an actual call inside a template string slipped past.
    const stripCommentsAndStrings = (source: string) =>
      source
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ")
        .replace(/`(?:\\.|[^`\\])*`/g, "``")
        .replace(/"(?:\\.|[^"\\])*"/g, '""')
        .replace(/'(?:\\.|[^'\\])*'/g, "''");

    const routesDirectory = new URL("..", import.meta.url);
    const broadInvalidations = readdirSync(routesDirectory)
      .filter((file) => file.endsWith(".tsx") && file !== "__root.tsx")
      .filter((file) =>
        /router\s*\.\s*invalidate\s*\(\s*\)/.test(
          stripCommentsAndStrings(readFileSync(new URL(file, routesDirectory), "utf8")),
        ),
      );

    expect(broadInvalidations).toEqual([]);
  });
});
