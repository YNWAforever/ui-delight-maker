import { describe, expect, it } from "vitest";
import {
  measureRouteBrowserScenarios,
  measureRoutePerformance,
  measureRoutePerformanceBaseline,
  runRoutePerformanceMeasurement,
} from "../../../../scripts/clientops/measure-route-performance";
import {
  APP_ROUTE_FAMILIES,
  ROUTE_PERFORMANCE_BUDGET,
  evaluateRouteMeasurement,
  type RoutePerformanceMeasurement,
} from "../route-performance";

const typicalClientMeasurement: RoutePerformanceMeasurement = {
  routeFamily: "clients",
  routePath: "/clients",
  fixture: "typical",
  serverCallCount: 1,
  databaseQueryCount: 4,
  responseBytes: 2_000,
  routeChunkBytes: 20_000,
  hasNPlusOne: false,
};

function runMeasurementMode(mode: "baseline" | "verify") {
  let output = "";
  const exitCode = runRoutePerformanceMeasurement(mode, (value) => {
    output = value;
  });

  return { exitCode, output: JSON.parse(output) };
}

describe("route performance review regressions", () => {
  it("covers every user-facing route family with exact route paths", () => {
    expect(
      APP_ROUTE_FAMILIES.map((entry) => [
        entry.id,
        entry.paths,
        entry.initialPayloadBudgetExemptPaths ?? [],
      ]),
    ).toEqual([
      ["auth", ["/login", "/login/$authPath", "/invite/$token", "/invite/$token/complete"], []],
      ["shell", ["/__root"], []],
      ["dashboard", ["/"], []],
      ["accounts", ["/accounts", "/accounts/$id"], []],
      ["clients", ["/clients", "/clients/$id", "/clients/import"], ["/clients/import"]],
      ["leads", ["/leads", "/leads/$id"], []],
      ["campaigns", ["/campaigns", "/campaigns/$id"], []],
      ["quotes", ["/quotes", "/quotes/new", "/quotes/$id", "/quotes/$id/pdf"], ["/quotes/$id/pdf"]],
      ["job-sheets", ["/job-sheets", "/job-sheets/$id"], []],
      ["tasks", ["/tasks"], []],
      ["approvals", ["/approvals"], []],
      ["renewals", ["/renewals"], []],
      ["relationships", ["/relationships"], []],
      ["notifications", ["/notifications"], []],
      ["reports", ["/reports"], []],
      ["settings", ["/settings"], []],
      ["account", ["/account"], []],
      ["agents", ["/agents", "/agents/$name"], []],
      ["ai-review", ["/ai-review"], []],
      [
        "admin",
        [
          "/admin",
          "/admin/people",
          "/admin/people/$id",
          "/admin/teams",
          "/admin/teams/$id",
          "/admin/access",
          "/admin/audit",
        ],
        [],
      ],
    ]);
  });

  it("enforces each budget boundary and rejects N+1 queries", () => {
    const atBudget = {
      ...typicalClientMeasurement,
      serverCallCount: ROUTE_PERFORMANCE_BUDGET.maxPrimaryServerCalls,
      responseBytes: ROUTE_PERFORMANCE_BUDGET.maxInitialPayloadBytes,
      routeChunkBytes: ROUTE_PERFORMANCE_BUDGET.maxRouteChunkBytes,
    };

    expect(evaluateRouteMeasurement(atBudget)).toEqual([]);
    expect(
      evaluateRouteMeasurement({
        ...atBudget,
        serverCallCount: atBudget.serverCallCount + 1,
      }),
    ).toEqual(["server calls"]);
    expect(
      evaluateRouteMeasurement({
        ...atBudget,
        responseBytes: atBudget.responseBytes + 1,
      }),
    ).toEqual(["payload bytes"]);
    expect(
      evaluateRouteMeasurement({
        ...atBudget,
        routeChunkBytes: atBudget.routeChunkBytes + 1,
      }),
    ).toEqual(["route chunk bytes"]);
    expect(evaluateRouteMeasurement({ ...atBudget, hasNPlusOne: true })).toEqual(["N+1 queries"]);
  });

  it("exempts only document and PDF paths from the initial payload budget", () => {
    const overPayloadBudget = {
      ...typicalClientMeasurement,
      responseBytes: ROUTE_PERFORMANCE_BUDGET.maxInitialPayloadBytes + 1,
    };

    expect(evaluateRouteMeasurement(overPayloadBudget)).toEqual(["payload bytes"]);
    expect(
      evaluateRouteMeasurement({
        ...overPayloadBudget,
        routePath: "/clients/import",
      }),
    ).toEqual([]);
    expect(
      evaluateRouteMeasurement({
        ...overPayloadBudget,
        routeFamily: "quotes",
        routePath: "/quotes",
      }),
    ).toEqual(["payload bytes"]);
    expect(
      evaluateRouteMeasurement({
        ...overPayloadBudget,
        routeFamily: "quotes",
        routePath: "/quotes/$id/pdf",
      }),
    ).toEqual([]);
  });

  it("emits complete baseline, final, and browser measurement matrices", () => {
    const measurements = measureRoutePerformance();
    const baselineMeasurements = measureRoutePerformanceBaseline();
    const browserMeasurements = measureRouteBrowserScenarios();

    expect(APP_ROUTE_FAMILIES).toHaveLength(20);
    expect(measurements).toHaveLength(60);
    expect(measurements.filter((measurement) => measurement.routePath === "/clients")).toHaveLength(
      3,
    );
    expect(measurements.every((measurement) => measurement.failures.length === 0)).toBe(true);
    expect(baselineMeasurements.some((measurement) => measurement.failures.length > 0)).toBe(true);
    expect(browserMeasurements).toHaveLength(80);
  });

  it("keeps baseline evidence while verify accepts the final measurements", () => {
    const baseline = runMeasurementMode("baseline");
    const verify = runMeasurementMode("verify");

    expect(baseline.exitCode).toBe(0);
    expect(baseline.output).toMatchObject({
      mode: "baseline",
      routeFamilyCount: 20,
      measurementCount: 60,
    });
    expect(
      baseline.output.measurements.some(
        (measurement: { failures: string[] }) => measurement.failures.length > 0,
      ),
    ).toBe(true);
    expect(verify.exitCode).toBe(0);
    expect(verify.output).toMatchObject({
      mode: "verify",
      phase: "final",
      routeFamilyCount: 20,
      measurementCount: 60,
      browserMeasurementCount: 80,
    });
    expect(
      verify.output.measurements.every(
        (measurement: { failures: string[] }) => measurement.failures.length === 0,
      ),
    ).toBe(true);
  });
});
