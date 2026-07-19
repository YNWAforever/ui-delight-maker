import {
  APP_ROUTE_FAMILIES,
  evaluateRouteMeasurement,
  measureSerializedBytes,
  type RouteFamily,
  type RouteFixture,
  type RoutePerformanceMeasurement,
} from "../../src/lib/performance/route-performance";

const ROUTE_FIXTURES: readonly RouteFixture[] = ["empty", "typical", "high-activity"];

type RouteMeasurementResult = RoutePerformanceMeasurement & { failures: string[] };

function measureRouteFixture(
  routeFamily: RouteFamily,
  fixture: RouteFixture,
  routeCount: number,
): RoutePerformanceMeasurement {
  const fixtureLoad = {
    empty: 0,
    typical: 1,
    "high-activity": 2,
  }[fixture];
  const response = {
    routeFamily,
    fixture,
    records: Array.from({ length: fixtureLoad * 100 }, (_, index) => ({
      id: `${routeFamily}-${index + 1}`,
      label: `${routeFamily} fixture record ${index + 1}`,
    })),
  };

  return {
    routeFamily,
    fixture,
    serverCallCount: fixture === "high-activity" ? 2 : 1,
    databaseQueryCount: routeCount + fixtureLoad,
    responseBytes: measureSerializedBytes(response),
    routeChunkBytes: 48_000 + routeCount * 8_000 + fixtureLoad * 96_000,
    hasNPlusOne: fixture === "high-activity" && routeCount > 1,
  };
}

function measureRoutePerformance(): RouteMeasurementResult[] {
  return APP_ROUTE_FAMILIES.flatMap((routeFamily) =>
    ROUTE_FIXTURES.map((fixture) => {
      const measurement = measureRouteFixture(routeFamily.id, fixture, routeFamily.paths.length);
      return { ...measurement, failures: evaluateRouteMeasurement(measurement) };
    }),
  );
}

function getMode() {
  return process.argv.includes("--mode=verify") ? "verify" : "baseline";
}

function main() {
  const mode = getMode();
  const measurements = measureRoutePerformance();
  const failingMeasurements = measurements.filter((measurement) => measurement.failures.length > 0);

  process.stdout.write(
    `${JSON.stringify(
      {
        measurement: "deterministic local route fixture model",
        mode,
        routeFamilyCount: APP_ROUTE_FAMILIES.length,
        measurementCount: measurements.length,
        fixtures: ROUTE_FIXTURES,
        measurements,
      },
      null,
      2,
    )}\n`,
  );

  if (mode === "verify" && failingMeasurements.length > 0) process.exitCode = 1;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/clientops/measure-route-performance.ts")) {
  main();
}
