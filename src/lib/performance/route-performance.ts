export type RouteFixture = "empty" | "typical" | "high-activity";
export type RouteFamily =
  | "auth"
  | "shell"
  | "dashboard"
  | "accounts"
  | "clients"
  | "leads"
  | "campaigns"
  | "quotes"
  | "job-sheets"
  | "tasks"
  | "approvals"
  | "renewals"
  | "relationships"
  | "notifications"
  | "reports"
  | "settings"
  | "account"
  | "agents"
  | "ai-review"
  | "admin";

export const ROUTE_PERFORMANCE_BUDGET = {
  maxInitialPayloadBytes: 102_400,
  maxRouteChunkBytes: 256_000,
  maxPrimaryServerCalls: 1,
} as const;
export type RoutePerformanceBudget = typeof ROUTE_PERFORMANCE_BUDGET;

export type RoutePerformanceRoute = {
  id: RouteFamily;
  paths: readonly string[];
  initialPayloadBudgetExemptPaths?: readonly string[];
};

export const APP_ROUTE_FAMILIES: ReadonlyArray<RoutePerformanceRoute> = [
  {
    id: "auth",
    paths: ["/login", "/login/$authPath", "/invite/$token", "/invite/$token/complete"],
  },
  { id: "shell", paths: ["/__root"] },
  { id: "dashboard", paths: ["/"] },
  { id: "accounts", paths: ["/accounts", "/accounts/$id"] },
  {
    id: "clients",
    paths: ["/clients", "/clients/$id", "/clients/import"],
    initialPayloadBudgetExemptPaths: ["/clients/import"],
  },
  // `/leads/import` needs no initial-payload exemption: unlike `/clients/import` it has no
  // loader, so it ships no data at all.
  { id: "leads", paths: ["/leads", "/leads/$id", "/leads/import"] },
  { id: "campaigns", paths: ["/campaigns", "/campaigns/$id"] },
  {
    id: "quotes",
    paths: ["/quotes", "/quotes/new", "/quotes/$id", "/quotes/$id/pdf"],
    initialPayloadBudgetExemptPaths: ["/quotes/$id/pdf"],
  },
  { id: "job-sheets", paths: ["/job-sheets", "/job-sheets/$id"] },
  { id: "tasks", paths: ["/tasks"] },
  { id: "approvals", paths: ["/approvals"] },
  { id: "renewals", paths: ["/renewals"] },
  { id: "relationships", paths: ["/relationships"] },
  { id: "notifications", paths: ["/notifications"] },
  { id: "reports", paths: ["/reports"] },
  { id: "settings", paths: ["/settings"] },
  { id: "account", paths: ["/account"] },
  { id: "agents", paths: ["/agents", "/agents/$name"] },
  { id: "ai-review", paths: ["/ai-review"] },
  {
    id: "admin",
    paths: [
      "/admin",
      "/admin/people",
      "/admin/people/$id",
      "/admin/teams",
      "/admin/teams/$id",
      "/admin/access",
      "/admin/audit",
    ],
  },
];

export type RoutePerformanceMeasurement = {
  routeFamily: RouteFamily;
  routePath: string;
  fixture: RouteFixture;
  serverCallCount: number;
  databaseQueryCount: number;
  responseBytes: number;
  routeChunkBytes: number;
  hasNPlusOne: boolean;
};

export function measureSerializedBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function isInitialPayloadBudgetExempt(
  value: Pick<RoutePerformanceMeasurement, "routeFamily" | "routePath">,
) {
  const routeFamily = APP_ROUTE_FAMILIES.find((entry) => entry.id === value.routeFamily);
  return routeFamily?.initialPayloadBudgetExemptPaths?.includes(value.routePath ?? "") ?? false;
}

export function evaluateRouteMeasurement(value: RoutePerformanceMeasurement) {
  const failures: string[] = [];
  if (value.serverCallCount > ROUTE_PERFORMANCE_BUDGET.maxPrimaryServerCalls) {
    failures.push("server calls");
  }
  if (
    value.responseBytes > ROUTE_PERFORMANCE_BUDGET.maxInitialPayloadBytes &&
    !isInitialPayloadBudgetExempt(value)
  ) {
    failures.push("payload bytes");
  }
  if (value.routeChunkBytes > ROUTE_PERFORMANCE_BUDGET.maxRouteChunkBytes) {
    failures.push("route chunk bytes");
  }
  if (value.hasNPlusOne) failures.push("N+1 queries");
  return failures;
}
