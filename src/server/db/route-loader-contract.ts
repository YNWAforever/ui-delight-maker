import { listMyAccessRequests, listMyDelegations } from "@/server/repositories/account";
import { listAccessRequests, listAdminAuditLogs } from "@/server/repositories/admin-access";
import { listDepartmentsAndTeams } from "@/server/repositories/admin-teams";
import { getAdminOverview, getAdminUser, listAdminUsers } from "@/server/repositories/admin-users";
import { listApprovals } from "@/server/repositories/approvals";
import { listCampaignsPage } from "@/server/repositories/campaigns";
import { listClientsPage } from "@/server/repositories/clients";
import { listJobSheetsPage } from "@/server/repositories/job-sheets";
import { listLeadsPage } from "@/server/repositories/leads";
import { countUnreadNotifications, listNotifications } from "@/server/repositories/notifications";
import { listProducts } from "@/server/repositories/products";
import { listQuotesPage } from "@/server/repositories/quotes";
import { listTasks } from "@/server/repositories/tasks";
import { getAccountsIndexReadModel } from "@/server/read-models/accounts-index";
import { getDashboardReadModel } from "@/server/read-models/dashboard";
import { loadRenewalsRead, loadReportSummary } from "@/server/read-models/operations";
import { loadQuoteCreateBootstrap } from "@/server/read-models/quote-workspace";
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

// Placeholder identity for entries whose read path needs a caller id (e.g. "my profile" or
// "my notifications"). The gate runs against an empty, migrated database, so no row will ever
// match this id — it only needs to be shaped like the real thing (profile ids look like the
// ones in src/lib/users.ts) so every join/cast the query performs still executes.
const FAKE_PROFILE_ID = "00000000-0000-0000-0000-000000000001";
// Placeholder product id for /quotes/new, which is frequently reached from the Renewals
// preview panel's "Draft renewal quote" action with a real productId query param. That path
// exercises an extra `where id = $1` / `case when product_id = $1` branch that the plain
// "New quote" button (no productId) never touches.
const FAKE_PRODUCT_ID = "00000000-0000-0000-0000-000000000099";

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
  {
    // getMyAccount() (src/server-functions/account.ts) awaits requireNeonAuthSession(), then
    // runs exactly these three reads concurrently — there is no single extracted read model,
    // so the composition below is the route's real post-auth read path, not a stand-in for it.
    route: "account",
    run: () =>
      Promise.all([
        getAdminUser(FAKE_PROFILE_ID),
        listMyDelegations(FAKE_PROFILE_ID),
        listMyAccessRequests(FAKE_PROFILE_ID),
      ]),
  },
  {
    route: "accounts",
    run: () =>
      getAccountsIndexReadModel(FAKE_PROFILE_ID, {
        lifecycle_stage: undefined,
        page: 1,
        limit: 50,
      } as Parameters<typeof getAccountsIndexReadModel>[1]),
  },
  {
    // admin.access defaults to the "requests" tab with requestStatus "pending"
    // (adminAccessSearchSchema), which is what getAdminAccessRequestsFn passes through to
    // listAccessRequests after requireCapability("access_requests.decide").
    route: "admin.access",
    run: () => listAccessRequests("pending"),
  },
  {
    route: "admin.audit",
    run: () =>
      listAdminAuditLogs({ page: 1, limit: 50 } as Parameters<typeof listAdminAuditLogs>[0]),
  },
  {
    route: "admin.index",
    run: () => getAdminOverview(),
  },
  {
    route: "admin.people",
    run: () => listAdminUsers({ page: 1, limit: 50 } as Parameters<typeof listAdminUsers>[0]),
  },
  {
    // admin.teams' loader also calls getAdminUsersFn for the member picker and (conditionally)
    // getAdminOrganizationUnitFn for a selected unit, but the organization directory is the
    // route's primary, always-fetched data and takes no filter arguments.
    route: "admin.teams",
    run: () => listDepartmentsAndTeams(),
  },
  {
    route: "approvals",
    run: () => listApprovals({}),
  },
  {
    route: "campaigns",
    run: () => listCampaignsPage({ page: 1, limit: 50 } as Parameters<typeof listCampaignsPage>[0]),
  },
  {
    route: "clients",
    run: () => listClientsPage({ page: 1, limit: 50 } as Parameters<typeof listClientsPage>[0]),
  },
  {
    route: "index",
    run: () => getDashboardReadModel(),
  },
  {
    route: "job-sheets",
    run: () => listJobSheetsPage({ page: 1, limit: 50 } as Parameters<typeof listJobSheetsPage>[0]),
  },
  {
    route: "leads",
    run: () => listLeadsPage({ page: 1, limit: 50 } as Parameters<typeof listLeadsPage>[0]),
  },
  {
    // getNotifications() (src/server-functions/notifications.ts) runs exactly these two reads
    // concurrently after requireNeonAuthSession() — no separate read model exists to import.
    route: "notifications",
    run: () =>
      Promise.all([listNotifications(FAKE_PROFILE_ID), countUnreadNotifications(FAKE_PROFILE_ID)]),
  },
  {
    route: "quotes",
    run: () => listQuotesPage({ page: 1, limit: 50 } as Parameters<typeof listQuotesPage>[0]),
  },
  {
    route: "quotes.new",
    run: () =>
      loadQuoteCreateBootstrap({ productId: FAKE_PRODUCT_ID } as Parameters<
        typeof loadQuoteCreateBootstrap
      >[0]),
  },
  {
    route: "reports",
    run: () => loadReportSummary({ range: "30d" } as Parameters<typeof loadReportSummary>[0]),
  },
  {
    route: "settings",
    run: () => listProducts({}),
  },
  {
    route: "tasks",
    run: () => listTasks({}),
  },
];

/**
 * Routes with a loader that the contract does not execute yet. Shrinking this list is the
 * work of expanding coverage; a route in neither list fails the completeness test, so new
 * routes cannot slip through unnoticed.
 */
export const ACKNOWLEDGED_UNCOVERED_ROUTES: string[] = [
  "accounts.$id",
  // agents and ai-review: getAgentDirectoryRead() and getAiReviewRead() (both in
  // src/server-functions/agent-runs.ts) run their query() calls directly inside the
  // createServerFn handler, after requireCapability/requireCapabilityChecks — there is no
  // separately exported, non-authenticated function to import. Registering the exported
  // server function would just prove that an unauthenticated call throws before touching SQL
  // (the exact vacuous-pass trap this gate exists to avoid), and hand-copying the inline SQL
  // into this file would test a duplicate instead of the production code, which is precisely
  // the silent-drift failure mode route-loader-completeness.test.ts calls out. Covering these
  // properly requires extracting the query logic into an importable read model first, which is
  // a production code change outside this test-coverage task.
  "agents",
  "agents.$name",
  "ai-review",
  "admin.people.$id",
  "admin.teams.$id",
  "campaigns.$id",
  "clients.$id",
  "invite.$token",
  "invite.$token.complete",
  "job-sheets.$id",
  "leads.$id",
  "quotes.$id",
  "quotes.$id_.pdf",
];
