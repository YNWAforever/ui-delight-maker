/**
 * Refreshing the things an administrative write changes that a query key cannot reach.
 *
 * `/admin` resolves its own navigation in a `beforeLoad`, outside the query cache
 * (`src/routes/admin.tsx`). So a write that changes what the actor may see — a role change,
 * a permission override, a suspension — updates `crmQueryKeys.shell()` and repaints the
 * *outer* sidebar, while the *inner* admin rail keeps rendering from stale route context
 * until a hard reload. The symptom is specific and bad: remove `audit.view` from yourself
 * and the Audit tab stays in the rail, and clicking it lands on the forbidden panel.
 *
 * `router.invalidate` with a filter is the only thing that re-runs a `beforeLoad`, and it
 * has to be scoped: a bare `router.invalidate()` re-runs every loader in the tree, which on
 * these screens means the directory, the selected unit and the member options as well.
 *
 * The router is typed structurally rather than as TanStack's `Router`, so the rule can be
 * tested without mounting one — the point of the helper is that every admin write agrees on
 * the same filter, and that is exactly what a test can assert.
 */

/** The route id of the admin layout whose `beforeLoad` resolves the rail's navigation. */
export const ADMIN_SHELL_ROUTE_ID = "/admin";

export type RouteMatchLike = { routeId: string };

export type AdminRouterLike = {
  invalidate: (options: { filter: (match: RouteMatchLike) => boolean }) => Promise<unknown> | void;
};

/**
 * Matches the admin layout route and nothing else.
 *
 * Exported separately so a call site can compose it, and so the test does not have to
 * reconstruct the predicate it is checking.
 */
export function isAdminShellMatch(match: RouteMatchLike): boolean {
  return match.routeId === ADMIN_SHELL_ROUTE_ID;
}

/**
 * Re-runs the admin layout's navigation resolution after a capability-affecting write.
 *
 * Call it *in addition to* the query invalidations, never instead of them: the rail comes
 * from route context and the workspace lists come from the query cache, and a write that
 * changes access changes both.
 */
export async function refreshAdminCapabilityScope(router: AdminRouterLike): Promise<void> {
  await router.invalidate({ filter: isAdminShellMatch });
}
