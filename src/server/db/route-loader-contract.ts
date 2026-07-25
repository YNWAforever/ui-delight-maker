import { loadRenewalsRead } from "@/server/read-models/operations";
import { loadRelationshipIndexRead } from "@/server/read-models/relationship-workspaces";

export type RouteLoaderContractEntry = {
  /** Route file basename without extension, e.g. "renewals" for src/routes/renewals.tsx */
  route: string;
  /**
   * Invokes the route's read path with the arguments its loaderDeps actually builds.
   * Realistic arguments are load-bearing: the /renewals failure only appeared with the
   * renewal window unfiltered, so a convenient-but-unrealistic value would have missed it.
   */
  run: () => Promise<unknown>;
};

export const ROUTE_LOADER_CONTRACT: RouteLoaderContractEntry[] = [
  {
    route: "renewals",
    run: () =>
      loadRenewalsRead({
        renewalWindow: "all",
        risk: undefined,
        productId: undefined,
        asOf: "2026-01-01",
        page: 1,
        limit: 50,
      } as Parameters<typeof loadRenewalsRead>[0]),
  },
  {
    route: "relationships",
    run: () =>
      loadRelationshipIndexRead({ page: 1, limit: 50 } as Parameters<
        typeof loadRelationshipIndexRead
      >[0]),
  },
];

/**
 * Routes with a loader that the contract does not execute yet. Shrinking this list is the
 * work of expanding coverage; a route in neither list fails the completeness test, so new
 * routes cannot slip through unnoticed.
 */
export const ACKNOWLEDGED_UNCOVERED_ROUTES: string[] = [
  "account",
  "accounts",
  "accounts.$id",
  "admin.access",
  "admin.audit",
  "admin.index",
  "admin.people",
  "admin.people.$id",
  "admin.teams",
  "admin.teams.$id",
  "agents",
  "agents.$name",
  "ai-review",
  "approvals",
  "campaigns",
  "campaigns.$id",
  "clients",
  "clients.$id",
  "index",
  "invite.$token",
  "invite.$token.complete",
  "job-sheets",
  "job-sheets.$id",
  "leads",
  "leads.$id",
  "notifications",
  "quotes",
  "quotes.$id",
  "quotes.$id_.pdf",
  "quotes.new",
  "reports",
  "settings",
  "tasks",
];
