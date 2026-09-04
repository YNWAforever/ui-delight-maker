import { AGENT_DEFINITIONS } from "@/lib/agents";
import { listMyAccessRequests, listMyDelegations } from "@/server/repositories/account";
import { listAccessRequests, listAdminAuditLogs } from "@/server/repositories/admin-access";
import { getInvitationPreview } from "@/server/repositories/admin-invitations";
import { getOrganizationUnit, listDepartmentsAndTeams } from "@/server/repositories/admin-teams";
import { getAdminOverview, getAdminUser, listAdminUsers } from "@/server/repositories/admin-users";
import { listApprovals } from "@/server/repositories/approvals";
import { getCampaignWithAttendeeSummary, listCampaignsPage } from "@/server/repositories/campaigns";
import { listClientsPage } from "@/server/repositories/clients";
import { getJobSheetOperationsRead, listJobSheetsPage } from "@/server/repositories/job-sheets";
import { listLeadsPage } from "@/server/repositories/leads";
import { countUnreadNotifications, listNotifications } from "@/server/repositories/notifications";
import { listProducts } from "@/server/repositories/products";
import { getQuoteWorkspaceDetail, listQuotesPage } from "@/server/repositories/quotes";
import { listRelationshipIndexPage } from "@/server/repositories/relationship-signals";
import { listTasks } from "@/server/repositories/tasks";
import { getAccountsIndexReadModel } from "@/server/read-models/accounts-index";
import { loadEffectiveAgentCatalogue } from "@/server/read-models/agent-catalogue";
import {
  loadAgentDirectoryRead,
  loadAgentHistoryPage,
  loadAiReviewRead,
} from "@/server/read-models/agent-workspaces";
import type { RowAuthorizer } from "@/server/auth/authorization.server";
import { resolveOwnerProfileIds } from "@/server/auth/resource-ownership";
import { loadClientWorkspaceRead } from "@/server/read-models/client-workspace";
import { getDashboardReadModel } from "@/server/read-models/dashboard";
import { loadRenewalsRead, loadReportSummary } from "@/server/read-models/operations";
import {
  loadQuoteCreateBootstrap,
  loadQuoteDocumentRead,
} from "@/server/read-models/quote-workspace";
import { loadLeadWorkspaceRead } from "@/server/read-models/relationship-workspaces";
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
  /**
   * Ceiling on queries this route's read path may issue against the seeded fixture.
   * Required, so a new route cannot be registered without a deliberate budget — a compile
   * error rather than a silent gap.
   *
   * A ceiling, not an exact count: adding a legitimate query should not churn this file,
   * while N+1 multiplies rather than increments and blows straight through.
   */
  maxQueries: number;
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

/**
 * Ids that resolve to rows created by seedRouteLoaderFixture. Task 4 points the detail
 * entries at these rather than MISSING_ID: with a missing id every detail route
 * short-circuits on its "not found" check, so its query budget would measure the
 * not-found path instead of the path worth budgeting.
 */
export const FIXTURE = {
  profileId: "fixture-user-1",
  productId: "00000000-0000-4000-8000-000000000101",
  accountId: "00000000-0000-4000-8000-000000000201",
  clientId: "00000000-0000-4000-8000-000000000301",
  leadId: "00000000-0000-4000-8000-000000000401",
  campaignId: "00000000-0000-4000-8000-000000000501",
  quoteId: "00000000-0000-4000-8000-000000000601",
  engagementId: "00000000-0000-4000-8000-000000000701",
  jobSheetId: "00000000-0000-4000-8000-000000001001",
  departmentId: "00000000-0000-4000-8000-000000001101",
} as const;
// Placeholder invitation token for /invite/$token, whose path param is an opaque token string,
// not a UUID. Real tokens are 32 random bytes, base64url-encoded (see
// `randomBytes(32).toString("base64url")` in src/server/repositories/admin-invitations.ts);
// this just needs to be a string, since hashInvitationToken() hashes it before the lookup
// query runs.
const MISSING_TOKEN = "0000000000000000000000000000000000000000000";

/**
 * A `RowAuthorizer` for the three agent-workspace entries below, which call the read models
 * directly rather than through the server functions that would normally build one via
 * `requirePageAuthorization` — there is no request/session to load a real authorization context
 * from here. It still resolves real ownership through `resolveOwnerProfileIds`, so the queries
 * this gate counts are the queries the route actually issues, not a stand-in for them; the
 * boolean verdict itself is irrelevant to every assertion in this file, which measures query
 * counts, not what gets redacted.
 */
function fixtureRows(): RowAuthorizer {
  return {
    async allow(_capability, resourceType, ids) {
      const owners = await resolveOwnerProfileIds(resourceType, ids);
      const decided = new Map<string, boolean>();
      for (const id of ids) decided.set(id, owners.get(id) != null);
      return decided;
    },
  };
}

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
    maxQueries: 3,
  },
  {
    route: "relationships",
    run: () =>
      listRelationshipIndexPage({ page: 1, limit: 50 } as Parameters<
        typeof listRelationshipIndexPage
      >[0]),
    maxQueries: 2,
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
    maxQueries: 3,
  },
  {
    route: "accounts",
    run: () =>
      getAccountsIndexReadModel(FAKE_PROFILE_ID, {
        lifecycle_stage: undefined,
        page: 1,
        limit: 50,
      } as Parameters<typeof getAccountsIndexReadModel>[1]),
    maxQueries: 6,
  },
  {
    // getCompanyWorkspaceRead() (src/server-functions/company-workspace.ts) awaits
    // requireNeonAuthSession(), then calls exactly this with the same arguments the route's
    // loader passes ({ sections: [] }). FIXTURE.accountId now resolves to a seeded accounts
    // row (with account_contacts and an open relationship_signals row), so the core reads
    // (getAccount, listAccountContacts) and the concurrently-fired overview reads
    // (getCompanyWorkspaceOverviewMetrics / listCompanyWorkspaceQuoteTotals /
    // listRelationshipSignals) all run against a real match instead of a guaranteed miss —
    // loadCompanyWorkspaceCore and loadCompanyWorkspaceOverview fire concurrently in the same
    // top-level Promise.all, so in fact all five queries already executed even against
    // MISSING_ID; repointing changes what they match, not whether they run. Caveat unchanged:
    // the overview portion is wrapped in its own try/catch that maps Postgres errors —
    // including schema-mismatch SQLSTATEs 42P01/42703/42883 — onto a normal
    // `{ status: "error" }` return value instead of rethrowing (see
    // src/server/company-workspace/errors.ts). A bug isolated to that portion would not fail
    // this test; only the core reads, which are not try/catch-wrapped, are guaranteed to
    // surface as a gate failure. Confirmed by spot-check.
    route: "accounts.$id",
    run: () => loadCompanyWorkspaceRead(FIXTURE.accountId, []),
    maxQueries: 5,
  },
  {
    // admin.access defaults to the "requests" tab with requestStatus "pending"
    // (adminAccessSearchSchema), which is what getAdminAccessRequestsFn passes through to
    // listAccessRequests after requireCapability("access_requests.decide").
    route: "admin.access",
    run: () => listAccessRequests("pending"),
    maxQueries: 1,
  },
  {
    route: "admin.audit",
    run: () =>
      listAdminAuditLogs({ page: 1, limit: 50 } as Parameters<typeof listAdminAuditLogs>[0]),
    maxQueries: 2,
  },
  {
    route: "admin.index",
    run: () => getAdminOverview(),
    maxQueries: 1,
  },
  {
    route: "admin.people",
    run: () => listAdminUsers({ page: 1, limit: 50 } as Parameters<typeof listAdminUsers>[0]),
    maxQueries: 2,
  },
  {
    // getAdminUserFn() (src/server-functions/admin-users.ts) awaits
    // requireCapability("users.view", { profileId }), then calls getAdminUser(profileId)
    // directly — already imported above for the "account" entry's admin-overview read.
    // getAdminUser genuinely short-circuits on a miss (a single `select ... where p.id = $1`
    // returns no row, so it returns null before running the team-memberships or workload
    // reads), which is why this was previously budgeted at 1 despite not being a Task-4 TODO.
    // FIXTURE.profileId now resolves to a seeded profiles row, so the team-memberships query
    // and getUserWorkload's aggregate query also run — a real, expected increase, not N+1.
    route: "admin.people.$id",
    run: () => getAdminUser(FIXTURE.profileId),
    maxQueries: 3,
  },
  {
    // admin.teams' loader also calls getAdminUsersFn for the member picker and (conditionally)
    // getAdminOrganizationUnitFn for a selected unit, but the organization directory is the
    // route's primary, always-fetched data and takes no filter arguments.
    route: "admin.teams",
    run: () => listDepartmentsAndTeams(),
    maxQueries: 3,
  },
  {
    // getAdminOrganizationUnitFn() (src/server-functions/admin-teams.ts) awaits
    // requireCapability("teams.view", ...), then calls getOrganizationUnit(kind, id) directly.
    // adminOrganizationSearchSchema defaults `kind` to "department", so that's what a plain
    // /admin/teams/$id visit (no ?kind=team) runs; the "team" branch's membership query is not
    // exercised by this entry. The route's loader also fetches the member-picker user list via
    // getAdminUsersFn -> listAdminUsers, but that SQL is already covered by the admin.people
    // entry above, so it is not duplicated here.
    // Still MISSING_ID: the gate fixture creates no departments row, so this entry budgets
    // the not-found path, not a real organization-unit read.
    route: "admin.teams.$id",
    run: () => getOrganizationUnit("department", FIXTURE.departmentId),
    maxQueries: 1,
  },
  {
    // getAgentDirectoryRead() (src/server-functions/agent-runs.ts) awaits
    // requireCapabilitySet(["agents.view"], { optional: AGENT_SUBJECT_VIEW_CAPABILITIES }), then
    // calls loadAgentDirectoryRead(access) with the resolved access map — the read model this
    // SQL was extracted into so the gate could reach it. The route's loader itself passes no
    // arguments; access is resolved once by the server function, same as agents.$name below.
    // Redaction is in-memory, so it cannot change the query count this entry measures — an
    // empty map redacts every row and still issues the same four queries.
    route: "agents",
    run: () => loadAgentDirectoryRead({}, fixtureRows()),
    // Four, deliberately. The fourth is the attention query: stuck, failed and
    // waiting-approval runs are now selected in SQL across every row, rather than being
    // derived on the client from whichever page of recent runs happened to load — which
    // could not see a stuck run older than that window. One query buys correctness that
    // no amount of client-side filtering could reach.
    //
    // This budget was already stale on main: the read model gained the query there and the
    // number was never raised, but the contract suite could not report it because Actions
    // was blocked on billing from 12 August.
    //
    // 4 -> 5 on 2026-08-29: loadEffectiveAgentCatalogue adds loadAgentPolicies' single
    // `select distinct on (workflow_type)`. It rides in the existing Promise.all, so this is
    // one more query and no more round trips. Without it this page renders the code catalogue's
    // status while the dispatch path obeys a stored override.
    //
    // 5 -> 7 on 2026-09-04, for row-level agent redaction (BD-3 slice 3 PR C). fixtureRows()
    // now resolves real per-row ownership instead of an in-memory allow-all, and that costs
    // one query per distinct subject type present on the page. The directory fixture spans
    // three distinct subject types, so this is +3, not +1 — three separate
    // resolveOwnerProfileIds calls, one per type, not an N+1 fan-out over rows. The figure
    // tracks this fixture, not production: a real directory page spanning more subject types
    // costs more. What the third query buys: row-level ownership resolution, so a deny
    // override scoped to one record finally redacts that row instead of only ever redacting
    // (or admitting) an entire subject type at once.
    maxQueries: 7,
  },
  {
    // getAgentHistoryPage() (src/server-functions/agent-runs.ts) awaits
    // requireCapabilitySet(["agents.view"], { optional: AGENT_SUBJECT_VIEW_CAPABILITIES }), then
    // calls loadAgentHistoryPage({ ...data, access }) with the already-normalized validator
    // output plus the resolved access map. The optional capabilities come back as booleans for
    // per-row redaction, not as a second query — no target is passed, so no ownership query
    // runs. The route resolves params.name to an AGENT_DEFINITIONS entry and passes its
    // display_name, so a real definition is used here rather than a placeholder — the agent
    // name is a plain text filter, and page/limit mirror the loader's own
    // { page: search.page, limit: 25 }.
    //
    // 3 -> 4 on 2026-08-29: the loader now resolves params.name from
    // loadEffectiveAgentCatalogue rather than the code catalogue, so a paused agent reads as
    // paused here. One query.
    route: "agents.$name",
    run: () =>
      Promise.all([
        loadEffectiveAgentCatalogue(),
        loadAgentHistoryPage({
          agent: AGENT_DEFINITIONS[0].display_name,
          page: 1,
          limit: 25,
          // The access map's contents cannot change the query count this entry measures; an
          // empty map redacts every row. `rows` now resolves real ownership per distinct
          // subject on the page, which is a genuine extra query this budget does not yet
          // account for — see the maxQueries comment below.
          access: {},
          rows: fixtureRows(),
        }),
      ]),
    maxQueries: 4,
  },
  {
    // getAiReviewRead() (src/server-functions/agent-runs.ts) awaits
    // requireCapabilitySet(["approvals.view", "agents.view"], { optional:
    // AGENT_SUBJECT_VIEW_CAPABILITIES }), then calls loadAiReviewRead(access) with the resolved
    // access map — the read model this SQL was extracted into so the gate could reach it. Both
    // capabilities stay required and still throw on denial exactly as the two-check pair they
    // replaced; the subject capabilities come back as booleans with no target passed, so no
    // ownership query runs and this entry's query count is unchanged. Redaction of
    // humanReviewRuns happens in memory in loadAiReviewRead, same as loadAgentDirectoryRead
    // above — an empty map redacts every row and still issues the same two queries.
    //
    // 2 -> 3 on 2026-09-04, for row-level agent redaction (BD-3 slice 3 PR C), the same change
    // as the agents entry above: fixtureRows() now resolves real per-row ownership rather than
    // an in-memory allow-all, at a cost of one query per distinct subject type present on the
    // page. The ai-review fixture spans one distinct subject type, so this is +1, not an N+1 —
    // a single resolveOwnerProfileIds call, not one per row. The figure tracks this fixture,
    // not production: a real ai-review page spanning more subject types costs more. What the
    // third query buys: row-level ownership resolution, so a deny override scoped to one
    // record finally redacts that row instead of only ever redacting (or admitting) an entire
    // subject type at once.
    route: "ai-review",
    run: () => loadAiReviewRead({}, fixtureRows()),
    maxQueries: 3,
  },
  {
    route: "approvals",
    run: () => listApprovals({}),
    maxQueries: 1,
  },
  {
    route: "campaigns",
    run: () => listCampaignsPage({ page: 1, limit: 50 } as Parameters<typeof listCampaignsPage>[0]),
    maxQueries: 2,
  },
  {
    // getCampaignWorkspaceRead() (src/server-functions/relationship-workspaces.ts) awaits
    // requireCapability("campaigns.view", ...), then calls getCampaignWithAttendeeSummary(id)
    // directly, which is itself a one-line pass-through to getCampaignWithAttendeeSummary.
    // FIXTURE.campaignId now resolves to a seeded campaigns row; the campaign and
    // attendee-summary reads fire concurrently and unconditionally either way, so the query
    // count is unchanged from MISSING_ID — this only changes which row (if any) is matched.
    route: "campaigns.$id",
    run: () => getCampaignWithAttendeeSummary(FIXTURE.campaignId),
    maxQueries: 2,
  },
  {
    route: "clients",
    run: () => listClientsPage({ page: 1, limit: 50 } as Parameters<typeof listClientsPage>[0]),
    maxQueries: 2,
  },
  {
    // getClientWorkspaceRead() (src/server-functions/client-workspace.ts) computes a
    // capability-gated visibility map before calling loadClientWorkspaceRead; this runs with
    // the function's default (every section visible), which exercises every
    // `case when $n::boolean then (select count(*) ...)` branch of the counts query instead of
    // skipping them, matching the route's loader ({ clientId: params.id }, no section filter).
    // FIXTURE.clientId now resolves to a seeded clients row; getClient and the counts query
    // fire concurrently and unconditionally either way, so the query count is unchanged from
    // MISSING_ID — this only changes which row (if any) is matched.
    route: "clients.$id",
    run: () => loadClientWorkspaceRead(FIXTURE.clientId),
    maxQueries: 2,
  },
  {
    // The import wizard's loader reads the active product catalogue, because
    // validateImportRows rejects any product_name that is not one of them and the wizard
    // previously gave the user no way to know the accepted names before uploading.
    route: "clients.import",
    run: () => listProducts({ activeOnly: true }),
    maxQueries: 1,
  },
  {
    route: "index",
    run: () => getDashboardReadModel(),
    maxQueries: 8,
  },
  {
    // getInvitationPreview() (src/server-functions/admin-invitations.ts) has no auth call —
    // an invitation preview must be readable by a signed-out visitor completing signup — so
    // there is no requireCapability/requireNeonAuthSession to bypass here. Its handler calls
    // the repository's getInvitationPreview(token) directly, which hashes the token and looks
    // it up by token_hash before checking whether a matching invitation was found.
    // Still MISSING_TOKEN, deliberately: unlike the detail routes above, the not-found path
    // *is* the path worth budgeting here. A stale or already-used invitation link is the real
    // way a signed-out visitor reaches this route with a token that hashes to no row — there
    // is no "found" case to prefer measuring instead.
    route: "invite.$token",
    run: () => getInvitationPreview(MISSING_TOKEN),
    maxQueries: 1,
  },
  {
    route: "job-sheets",
    run: () => listJobSheetsPage({ page: 1, limit: 50 } as Parameters<typeof listJobSheetsPage>[0]),
    maxQueries: 2,
  },
  {
    // getJobSheetRead() (src/server-functions/operations.ts) awaits
    // requireCapability("job_sheets.view", ...), then calls getJobSheetOperationsRead(id) directly
    // (a one-line pass-through to getJobSheetOperationsRead). The handler's follow-up
    // requireCapabilitySet calls for the linked quote/client run after this read and gate
    // visibility of those fields only — they do not affect the job sheet SQL itself.
    // FIXTURE.jobSheetId resolves to a real row, so this exercises the full read rather
    // than stopping at the not-found check. It needed a quote_versions row in the fixture
    // first, because job_sheets.accepted_quote_version_id is NOT NULL.
    route: "job-sheets.$id",
    run: () => getJobSheetOperationsRead(FIXTURE.jobSheetId),
    maxQueries: 2,
  },
  {
    route: "leads",
    run: () => listLeadsPage({ page: 1, limit: 50 } as Parameters<typeof listLeadsPage>[0]),
    maxQueries: 2,
  },
  {
    // getLeadWorkspaceRead() (src/server-functions/relationship-workspaces.ts) awaits
    // requireCapabilityChecks([...]), then calls loadLeadWorkspaceRead(id) directly, which
    // runs the lead, activity-log, and quote reads concurrently (not gated behind an
    // existence check), so all three are planned and validated by Postgres on every call.
    // FIXTURE.leadId now resolves to a seeded leads row, so this exercises the same three
    // reads against real matching data rather than a guaranteed miss.
    route: "leads.$id",
    run: () => loadLeadWorkspaceRead(FIXTURE.leadId),
    maxQueries: 3,
  },
  {
    // getNotifications() (src/server-functions/notifications.ts) runs exactly these two reads
    // concurrently after requireNeonAuthSession() — no separate read model exists to import.
    route: "notifications",
    run: () =>
      Promise.all([listNotifications(FAKE_PROFILE_ID), countUnreadNotifications(FAKE_PROFILE_ID)]),
    maxQueries: 2,
  },
  {
    // The join used to be conditional on a page-level `visibility` pair, so this entry passed
    // both flags true deliberately — the widest query the route could issue, so a join added
    // later could not go uncounted. The join is now unconditional (row-level redaction happens
    // after this read, in getQuotesPage — a repository-level entry like this one bypasses that
    // layer entirely, same as the "tasks" entry below), so there is no longer a narrow case to
    // avoid measuring. `searchScope` is passed true/true anyway: it only shapes the search
    // predicate, this call passes no search text so it cannot move the query count either way,
    // and the widest setting is the safer default for anyone who copies this fixture later.
    // Still two queries — the aggregate replaced the count rather than joining it.
    route: "quotes",
    run: () =>
      listQuotesPage({
        page: 1,
        limit: 50,
        searchScope: { leads: true, clients: true },
      }),
    maxQueries: 2,
  },
  {
    // getQuoteDetailRead() (src/server-functions/quotes.ts) awaits authorizeQuote(id), then
    // calls getQuoteWorkspaceDetail(id) directly (a one-line pass-through to
    // getQuoteWorkspaceDetail). The handler's resolveLinkedQuoteVisibility() call runs after
    // this read using its result, so it does not affect the quote SQL itself.
    // getQuoteWorkspaceDetail is genuinely sequential: it queries the quote row first and
    // throws "Quote not found" before ever reaching the client/lead lookups, which is why
    // MISSING_ID measured only 1 query here. FIXTURE.quoteId now resolves to a seeded quotes
    // row with a client_id set (lead_id null), so the client lookup also fires.
    route: "quotes.$id",
    run: () => getQuoteWorkspaceDetail(FIXTURE.quoteId),
    maxQueries: 2,
  },
  {
    // getQuoteDocumentRead() (src/server-functions/quotes.ts) calls loadQuoteDocumentRead(id)
    // directly, which starts with the same getQuoteWorkspaceDetail that quotes.$id runs above.
    // FIXTURE.quoteId now resolves to the same seeded quotes row used there (status "draft"),
    // so this entry gets the same quote+client reads. loadQuoteDocumentRead then computes
    // immutableVersionId(quote): for a "draft" quote (not accepted/sent/viewed) that falls
    // through to `quote.accepted_version_id ?? quote.issued_version_id ?? null`, and the
    // fixture row sets neither column, so the pointer is null and getQuoteDocumentVersion is
    // never reached — the document-version query still needs a quote in "sent"/"accepted"
    // status to be reachable, which this fixture row deliberately is not.
    route: "quotes.$id_.pdf",
    run: () => loadQuoteDocumentRead(FIXTURE.quoteId),
    maxQueries: 2,
  },
  {
    route: "quotes.new",
    run: () =>
      loadQuoteCreateBootstrap({ productId: FAKE_PRODUCT_ID } as Parameters<
        typeof loadQuoteCreateBootstrap
      >[0]),
    maxQueries: 10,
  },
  {
    route: "reports",
    run: () => loadReportSummary({ range: "30d" } as Parameters<typeof loadReportSummary>[0]),
    maxQueries: 1,
  },
  {
    // 1 -> 2 on 2026-08-29: the agent panel mirrored AGENT_DEFINITIONS, which stopped being the
    // governing value when the policy store shipped. This route doubles its budget, from one
    // query to two - worth stating plainly rather than burying.
    route: "settings",
    run: () => Promise.all([listProducts({}), loadEffectiveAgentCatalogue()]),
    maxQueries: 2,
  },
  {
    route: "tasks",
    // Unchanged at 1 on 2026-09-04, deliberately, and worth explaining: the tasks list gained
    // row-level redaction that same day, which costs one ownership query per page. That query
    // does NOT appear here, because this entry calls the repository directly while the
    // authorization lives in getTasks, the server function above it. So the route really costs
    // two queries and this budget measures one.
    //
    // The number is still right for what it guards — a regression inside listTasks itself —
    // but it is not a statement about what the route costs end to end. Raising it to 2 would
    // be worse: it would leave a query of slack that a real N+1 could hide in.
    run: () => listTasks({}),
    maxQueries: 1,
  },
];

/**
 * Routes with a loader that the contract does not execute yet. Shrinking this list is the
 * work of expanding coverage; a route in neither list fails the completeness test, so new
 * routes cannot slip through unnoticed.
 */
export const ACKNOWLEDGED_UNCOVERED_ROUTES: string[] = [
  // invite.$token.complete: its loader calls acceptUserInvitation (src/server-functions/
  // admin-invitations.ts), which is a mutation — it accepts the invitation and inserts a
  // profile row via requireNeonAuthIdentity() + acceptInvitation(). This gate covers read
  // paths only, so it is intentionally left uncovered rather than exercised as a fake write.
  "invite.$token.complete",
];
