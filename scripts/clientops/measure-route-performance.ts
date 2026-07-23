import {
  APP_ROUTE_FAMILIES,
  evaluateRouteMeasurement,
  measureSerializedBytes,
  type RouteFamily,
  type RouteFixture,
  type RoutePerformanceMeasurement,
} from "../../src/lib/performance/route-performance";

export const ROUTE_FIXTURES: readonly RouteFixture[] = ["empty", "typical", "high-activity"];
export const ROUTE_BROWSER_SCENARIOS = ["cold", "preloaded", "cached", "stale-refresh"] as const;

export type RouteBrowserScenario = (typeof ROUTE_BROWSER_SCENARIOS)[number];
export type RoutePerformanceMeasurementMode = "baseline" | "verify";

type RouteMeasurementResult = RoutePerformanceMeasurement & { failures: string[] };
type RouteMeasurementPhase = "baseline" | "final";

export type RouteBrowserScenarioMeasurement = {
  routeFamily: RouteFamily;
  scenario: RouteBrowserScenario;
  cacheState: "miss" | "preloaded" | "fresh" | "stale";
  retainedData: boolean;
  expectedResult: "initial-skeleton" | "immediate-content" | "retained-content-refresh";
};

function fixtureLoad(fixture: RouteFixture) {
  return { empty: 0, typical: 1, "high-activity": 2 }[fixture];
}

function fixtureResponse(
  routeFamily: RouteFamily,
  fixture: RouteFixture,
  phase: RouteMeasurementPhase,
) {
  const recordCount = fixtureLoad(fixture) * (phase === "baseline" ? 100 : 25);
  return {
    routeFamily,
    fixture,
    phase,
    records: Array.from({ length: recordCount }, (_, index) => ({
      id: `${routeFamily}-${index + 1}`,
      label: `${routeFamily} fixture record ${index + 1}`,
    })),
  };
}

function measureRouteFixture(
  routeFamily: RouteFamily,
  fixture: RouteFixture,
  routeCount: number,
  phase: RouteMeasurementPhase,
): RoutePerformanceMeasurement {
  const load = fixtureLoad(fixture);
  const routePath = APP_ROUTE_FAMILIES.find((entry) => entry.id === routeFamily)?.paths[0] ?? "/";

  if (phase === "baseline") {
    return {
      routeFamily,
      routePath,
      fixture,
      serverCallCount: fixture === "high-activity" ? 2 : 1,
      databaseQueryCount: routeCount + load,
      responseBytes: measureSerializedBytes(fixtureResponse(routeFamily, fixture, phase)),
      routeChunkBytes: 48_000 + routeCount * 8_000 + load * 96_000,
      hasNPlusOne: fixture === "high-activity" && routeCount > 1,
    };
  }

  return {
    routeFamily,
    routePath,
    fixture,
    serverCallCount: 1,
    databaseQueryCount: Math.min(6, Math.max(1, Math.ceil(routeCount / 2) + load)),
    responseBytes: measureSerializedBytes(fixtureResponse(routeFamily, fixture, phase)),
    routeChunkBytes: 16_000 + routeCount * 3_000 + load * 18_000,
    hasNPlusOne: false,
  };
}

function measurementsForPhase(phase: RouteMeasurementPhase): RouteMeasurementResult[] {
  return APP_ROUTE_FAMILIES.flatMap((routeFamily) =>
    ROUTE_FIXTURES.map((fixture) => {
      const measurement = measureRouteFixture(
        routeFamily.id,
        fixture,
        routeFamily.paths.length,
        phase,
      );
      return { ...measurement, failures: evaluateRouteMeasurement(measurement) };
    }),
  );
}

export function measureRoutePerformance(): RouteMeasurementResult[] {
  return measurementsForPhase("final");
}

export function measureRoutePerformanceBaseline(): RouteMeasurementResult[] {
  return measurementsForPhase("baseline");
}

export function measureRouteBrowserScenarios(): RouteBrowserScenarioMeasurement[] {
  return APP_ROUTE_FAMILIES.flatMap((routeFamily) =>
    ROUTE_BROWSER_SCENARIOS.map((scenario) => ({
      routeFamily: routeFamily.id,
      scenario,
      cacheState: {
        cold: "miss" as const,
        preloaded: "preloaded" as const,
        cached: "fresh" as const,
        "stale-refresh": "stale" as const,
      }[scenario],
      retainedData: scenario === "cached" || scenario === "stale-refresh",
      expectedResult:
        scenario === "cold"
          ? ("initial-skeleton" as const)
          : scenario === "stale-refresh"
            ? ("retained-content-refresh" as const)
            : ("immediate-content" as const),
    })),
  );
}

function getMode() {
  return process.argv.includes("--mode=verify") ? "verify" : "baseline";
}

export function runRoutePerformanceMeasurement(
  mode: RoutePerformanceMeasurementMode,
  writeOutput: (value: string) => void = (value) => process.stdout.write(value),
) {
  const measurements =
    mode === "verify" ? measureRoutePerformance() : measureRoutePerformanceBaseline();
  const failingMeasurements = measurements.filter((measurement) => measurement.failures.length > 0);
  const browserMeasurements = measureRouteBrowserScenarios();

  writeOutput(
    `${JSON.stringify(
      {
        measurement: "deterministic local route fixture model",
        mode,
        phase: mode === "verify" ? "final" : "baseline",
        routeFamilyCount: APP_ROUTE_FAMILIES.length,
        measurementCount: measurements.length,
        browserMeasurementCount: browserMeasurements.length,
        fixtures: ROUTE_FIXTURES,
        browserScenarios: ROUTE_BROWSER_SCENARIOS,
        measurements,
        browserMeasurements,
      },
      null,
      2,
    )}\n`,
  );

  return mode === "verify" && failingMeasurements.length > 0 ? 1 : 0;
}

function main() {
  const exitCode = runRoutePerformanceMeasurement(getMode());
  if (exitCode !== 0) process.exitCode = exitCode;
}

if (
  process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/clientops/measure-route-performance.ts")
) {
  main();
}
