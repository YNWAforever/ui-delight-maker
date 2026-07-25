import { listMyAccessRequests, listMyDelegations } from "@/server/repositories/account";
import { listAccessRequests, listAdminAuditLogs } from "@/server/repositories/admin-access";
import { getInvitationPreview } from "@/server/repositories/admin-invitations";
import { getOrganizationUnit, listDepartmentsAndTeams } from "@/server/repositories/admin-teams";
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
import { loadClientWorkspaceRead } from "@/server/read-models/client-workspace";
import { getDashboardReadModel } from "@/server/read-models/dashboard";
import {
  loadJobSheetRead,
  loadRenewalsRead,
  loadReportSummary,
} from "@/server/read-models/operations";
import {
  loadQuoteCreateBootstrap,
  loadQuoteDetailRead,
  loadQuoteDocumentRead,
} from "@/server/read-models/quote-workspace";
import {
  loadCampaignWorkspaceRead,
  loadLeadWorkspaceRead,
  loadRelationshipIndexRead,
} from "@/server/read-models/relationship-workspaces";
import { loadCompanyWorkspaceRead } from "@/server/company-workspace/loaders";

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
// Placeholder id for detail routes whose loader takes a path param (e.g. "/accounts/$id").
// The gate runs against an empty, migrated database, so no row will ever match this id — it
// only needs to be a syntactically valid UUID so every join/cast/subquery the route's read
// performs still gets planned and executed by Postgres before the route's own "not found"
// handling takes over.
const MISSING_ID = "00000000-0000-4000-8000-000000000000";
// Placeholder invitation token for /invite/$token, whose path param is an opaque token string,
// not a UUID. Real tokens are 32 random bytes, base64url-encoded (see
// `randomBytes(32).toString("base64url")` in src/server/repositories/admin-invitations.ts);
// this just needs to be a string, since hashInvitationToken() hashes it before the lookup
// query runs.
const MISSING_TOKEN = "0000000000000000000000000000000000000000000";

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
    // getCompanyWorkspaceRead() (src/server-functions/company-workspace.ts) awaits
    // requireNeonAuthSession(), then calls exactly this with the same arguments the route's
    // loader passes ({ sections: [] }). Caveat: loadCompanyWorkspaceRead's overview portion
    // (getCompanyWorkspaceOverviewMetrics / listCompanyWorkspaceQuoteTotals /
    // listRelationshipSignals) is wrapped in its own try/catch that maps Postgres errors —
    // including schema-mismatch SQLSTATEs 42P01/42703/42883 — onto a normal
    // `{ status: "error" }` return value instead of rethrowing (see
    // src/server/company-workspace/errors.ts). A bug isolated to that portion would not fail
    // this test; only the core reads (getAccount, listAccountContacts), which are not
    // try/catch-wrapped, are guaranteed to surface as a gate failure. Confirmed by spot-check.
    route: "accounts.$id",
    run: () => loadCompanyWorkspaceRead(MISSING_ID, []),
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
    // getAdminUserFn() (src/server-functions/admin-users.ts) awaits
    // requireCapability("users.view", { profileId }), then calls getAdminUser(profileId)
    // directly — already imported above for the "account" entry's admin-overview read.
    route: "admin.people.$id",
    run: () => getAdminUser(MISSING_ID),
  },
  {
    // admin.teams' loader also calls getAdminUsersFn for the member picker and (conditionally)
    // getAdminOrganizationUnitFn for a selected unit, but the organization directory is the
    // route's primary, always-fetched data and takes no filter arguments.
    route: "admin.teams",
    run: () => listDepartmentsAndTeams(),
  },
  {
    // getAdminOrganizationUnitFn() (src/server-functions/admin-teams.ts) awaits
    // requireCapability("teams.view", ...), then calls getOrganizationUnit(kind, id) directly.
    // adminOrganizationSearchSchema defaults `kind` to "department", so that's what a plain
    // /admin/teams/$id visit (no ?kind=team) runs; the "team" branch's membership query is not
    // exercised by this entry. The route's loader also fetches the member-picker user list via
    // getAdminUsersFn -> listAdminUsers, but that SQL is already covered by the admin.people
    // entry above, so it is not duplicated here.
    route: "admin.teams.$id",
    run: () => getOrganizationUnit("department", MISSING_ID),
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
    // getCampaignWorkspaceRead() (src/server-functions/relationship-workspaces.ts) awaits
    // requireCapability("campaigns.view", ...), then calls loadCampaignWorkspaceRead(id)
    // directly, which is itself a one-line pass-through to getCampaignWithAttendeeSummary.
    route: "campaigns.$id",
    run: () => loadCampaignWorkspaceRead(MISSING_ID),
  },
  {
    route: "clients",
    run: () => listClientsPage({ page: 1, limit: 50 } as Parameters<typeof listClientsPage>[0]),
  },
  {
    // getClientWorkspaceRead() (src/server-functions/client-workspace.ts) computes a
    // capability-gated visibility map before calling loadClientWorkspaceRead; this runs with
    // the function's default (every section visible), which exercises every
    // `case when $n::boolean then (select count(*) ...)` branch of the counts query instead of
    // skipping them, matching the route's loader ({ clientId: params.id }, no section filter).
    route: "clients.$id",
    run: () => loadClientWorkspaceRead(MISSING_ID),
  },
  {
    route: "index",
    run: () => getDashboardReadModel(),
  },
  {
    // getInvitationPreview() (src/server-functions/admin-invitations.ts) has no auth call —
    // an invitation preview must be readable by a signed-out visitor completing signup — so
    // there is no requireCapability/requireNeonAuthSession to bypass here. Its handler calls
    // the repository's getInvitationPreview(token) directly, which hashes the token and looks
    // it up by token_hash before checking whether a matching invitation was found.
    route: "invite.$token",
    run: () => getInvitationPreview(MISSING_TOKEN),
  },
  {
    route: "job-sheets",
    run: () => listJobSheetsPage({ page: 1, limit: 50 } as Parameters<typeof listJobSheetsPage>[0]),
  },
  {
    // getJobSheetRead() (src/server-functions/operations.ts) awaits
    // requireCapability("job_sheets.view", ...), then calls loadJobSheetRead(id) directly
    // (a one-line pass-through to getJobSheetOperationsRead). The handler's follow-up
    // requireCapabilitySet calls for the linked quote/client run after this read and gate
    // visibility of those fields only — they do not affect the job sheet SQL itself.
    route: "job-sheets.$id",
    run: () => loadJobSheetRead(MISSING_ID),
  },
  {
    route: "leads",
    run: () => listLeadsPage({ page: 1, limit: 50 } as Parameters<typeof listLeadsPage>[0]),
  },
  {
    // getLeadWorkspaceRead() (src/server-functions/relationship-workspaces.ts) awaits
    // requireCapabilityChecks([...]), then calls loadLeadWorkspaceRead(id) directly, which
    // runs the lead, activity-log, and quote reads concurrently (not gated behind an
    // existence check), so all three are planned and validated by Postgres on every call.
    route: "leads.$id",
    run: () => loadLeadWorkspaceRead(MISSING_ID),
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
    // getQuoteDetailRead() (src/server-functions/quotes.ts) awaits authorizeQuote(id), then
    // calls loadQuoteDetailRead(id) directly (a one-line pass-through to
    // getQuoteWorkspaceDetail). The handler's authorizeLinkedQuoteParties() call runs after
    // this read using its result, so it does not affect the quote SQL itself.
    route: "quotes.$id",
    run: () => loadQuoteDetailRead(MISSING_ID),
  },
  {
    // getQuoteDocumentRead() (src/server-functions/quotes.ts) calls loadQuoteDocumentRead(id)
    // directly, which starts with the same `select ... from quotes where id = $1` that
    // getQuoteWorkspaceDetail runs for quotes.$id above. On the empty gate database that
    // lookup misses before loadQuoteDocumentRead ever reaches getQuoteDocumentVersion, so this
    // entry's marginal coverage over quotes.$id is this route existing as its own
    // registration (a schema bug in the shared quotes select still fails this route too), not
    // additional SQL — the document-version query is only reachable with a real quote row.
    route: "quotes.$id_.pdf",
    run: () => loadQuoteDocumentRead(MISSING_ID),
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
  // invite.$token.complete: its loader calls acceptUserInvitation (src/server-functions/
  // admin-invitations.ts), which is a mutation — it accepts the invitation and inserts a
  // profile row via requireNeonAuthIdentity() + acceptInvitation(). This gate covers read
  // paths only, so it is intentionally left uncovered rather than exercised as a fake write.
  "invite.$token.complete",
];
