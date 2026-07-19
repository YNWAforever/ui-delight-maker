import { describe, expect, it } from "vitest";
import {
  APP_ROUTE_FAMILIES,
  ROUTE_PERFORMANCE_BUDGET,
  evaluateRouteMeasurement,
  measureSerializedBytes,
} from "../route-performance";

describe("route performance contract", () => {
  it("covers every user-facing route family", () => {
    expect(APP_ROUTE_FAMILIES.map((entry) => entry.id)).toEqual([
      "auth",
      "shell",
      "dashboard",
      "accounts",
      "clients",
      "leads",
      "campaigns",
      "quotes",
      "job-sheets",
      "tasks",
      "approvals",
      "renewals",
      "relationships",
      "notifications",
      "reports",
      "settings",
      "account",
      "agents",
      "ai-review",
      "admin",
    ]);
  });

  it("enforces payload, request, query, and chunk budgets", () => {
    expect(ROUTE_PERFORMANCE_BUDGET.maxInitialPayloadBytes).toBe(102_400);
    expect(ROUTE_PERFORMANCE_BUDGET.maxRouteChunkBytes).toBe(256_000);
    expect(
      evaluateRouteMeasurement({
        routeFamily: "clients",
        routePath: "/clients",
        fixture: "typical",
        serverCallCount: 1,
        databaseQueryCount: 4,
        responseBytes: 2_000,
        routeChunkBytes: 20_000,
        hasNPlusOne: false,
      }),
    ).toEqual([]);
  });

  it("measures UTF-8 serialized payload bytes", () => {
    expect(measureSerializedBytes({ label: "CRM" })).toBe(
      Buffer.byteLength(JSON.stringify({ label: "CRM" }), "utf8"),
    );
  });
});
