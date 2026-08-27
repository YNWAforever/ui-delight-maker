import { describe, expect, it, vi } from "vitest";

import {
  ADMIN_SHELL_ROUTE_ID,
  isAdminShellMatch,
  refreshAdminCapabilityScope,
} from "../admin-invalidation";

/**
 * The rule: a capability-affecting admin write re-runs `/admin`'s `beforeLoad`, and only
 * that one.
 *
 * `/admin` resolves the inner rail's navigation outside the query cache, so no
 * `invalidateQueries` can reach it. Removing `audit.view` from someone used to leave the
 * Audit tab in their rail until a hard reload — a navigation entry that lands on the
 * forbidden panel.
 *
 * The filter also has to stay narrow. A bare `router.invalidate()` re-runs every loader in
 * the tree, which on these screens means the directory, the selected unit and the member
 * options all refetch behind a single role change.
 */
describe("refreshAdminCapabilityScope", () => {
  it("matches the admin layout route and nothing else", () => {
    expect(isAdminShellMatch({ routeId: ADMIN_SHELL_ROUTE_ID })).toBe(true);
    expect(isAdminShellMatch({ routeId: "/admin" })).toBe(true);

    for (const routeId of [
      "/admin/people",
      "/admin/people/$id",
      "/admin/teams",
      "/admin/teams/$id",
      "/admin/access",
      "/admin/audit",
      "/admin/",
      "__root__",
      "/",
    ]) {
      expect({ routeId, matched: isAdminShellMatch({ routeId }) }).toEqual({
        routeId,
        matched: false,
      });
    }
  });

  it("invalidates through the router with that filter, and awaits it", async () => {
    const invalidate = vi.fn().mockResolvedValue(undefined);

    await refreshAdminCapabilityScope({ invalidate });

    expect(invalidate).toHaveBeenCalledTimes(1);
    const [options] = invalidate.mock.calls[0] as [{ filter: (m: { routeId: string }) => boolean }];
    expect(options.filter({ routeId: "/admin" })).toBe(true);
    expect(options.filter({ routeId: "/admin/audit" })).toBe(false);
  });

  it("tolerates a router whose invalidate returns nothing", async () => {
    // TanStack's `invalidate` returns a promise, but the helper is typed structurally so a
    // test double — or a future router — returning void must not break the await.
    const invalidate = vi.fn(() => undefined);
    await expect(refreshAdminCapabilityScope({ invalidate })).resolves.toBeUndefined();
  });
});
