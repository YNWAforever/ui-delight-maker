import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AccessRequestQueue,
  type AccessRequestDecision,
} from "@/components/admin/access-request-queue";
import { EffectiveAccessTable } from "@/components/admin/effective-access-table";
import {
  PermissionOverrideDialog,
  type PermissionOverrideSubmit,
} from "@/components/admin/permission-override-dialog";
import { AdminError } from "@/lib/admin/errors";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { adminAccessSearchSchema, type AdminAccessSearch } from "@/lib/admin/schemas";
import { ROLE_GRANTS } from "@/lib/admin/policy";
import { CAPABILITIES } from "@/lib/admin/types";
import type { PermissionOverrideRecord } from "@/server/repositories/admin-access";
import {
  createAdminPermissionOverrideFn,
  decideAdminAccessRequestFn,
  getAdminAccessRequestsFn,
  getAdminOverridesFn,
} from "@/server-functions/admin-access";
import { getAdminUsersFn } from "@/server-functions/admin-users";

const adminOverviewQueryKey = crmQueryKeys.admin.section("overview", "summary");
const accessRequestsQueryKey = (search: AdminAccessSearch) =>
  crmQueryKeys.admin.list({ scope: "access-requests", status: search.requestStatus });
const accessUsersQueryKey = crmQueryKeys.admin.list({
  scope: "access-users",
  status: "active",
  page: 1,
  limit: 100,
});
const accessOverridesQueryKey = (profileId: string) =>
  crmQueryKeys.admin.section(profileId, "access-overrides", { includeHistory: true });
const requestsQueryOptions = (search: AdminAccessSearch) =>
  routeQueryOptions({
    queryKey: accessRequestsQueryKey(search),
    queryFn: () => getAdminAccessRequestsFn({ data: { status: search.requestStatus } }),
  });
const usersQueryOptions = () =>
  routeQueryOptions({
    queryKey: accessUsersQueryKey,
    queryFn: () => getAdminUsersFn({ data: { status: "active", page: 1, limit: 100 } }),
  });
const overridesQueryOptions = (profileId: string) =>
  routeQueryOptions({
    queryKey: accessOverridesQueryKey(profileId),
    queryFn: () =>
      getAdminOverridesFn({ data: { profileId, includeHistory: true } }) as Promise<
        PermissionOverrideRecord[]
      >,
  });

export const Route = createFileRoute("/admin/access")({
  validateSearch: adminAccessSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, deps: { search } }) => {
    try {
      const requestedProfileId = search.profile;
      const [requests, users, requestedOverrides] = await Promise.all([
        context.queryClient.ensureQueryData(requestsQueryOptions(search)),
        context.queryClient.ensureQueryData(usersQueryOptions()),
        requestedProfileId
          ? context.queryClient.ensureQueryData(overridesQueryOptions(requestedProfileId))
          : Promise.resolve([] as PermissionOverrideRecord[]),
      ]);
      const selectedProfileId = requestedProfileId ?? users.items[0]?.id;
      const selectedUser = users.items.find((user) => user.id === selectedProfileId) ?? null;
      const overrides =
        selectedProfileId && selectedProfileId !== requestedProfileId
          ? await context.queryClient.ensureQueryData(overridesQueryOptions(selectedProfileId))
          : requestedOverrides;
      return { requests, users: users.items, selectedUser, overrides, forbidden: false };
    } catch (error) {
      if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code))
        return { requests: [], users: [], selectedUser: null, overrides: [], forbidden: true };
      throw error;
    }
  },
  head: () => ({ meta: [{ title: "Access review - Admin - Fimmick ClientOps" }] }),
  component: AdminAccessRoute,
});
function OverrideHistory({ overrides }: { overrides: readonly PermissionOverrideRecord[] }) {
  const history = overrides.filter((entry) => {
    return (
      Boolean(entry.revokedAt) ||
      Boolean(entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now())
    );
  });
  return (
    <section aria-label="Override history" className="space-y-3 border-t border-border px-4 py-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Expired and revoked history</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Historical overrides remain visible for review and are never treated as active access.
        </p>
      </div>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expired or revoked overrides.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-medium">Capability</th>
                <th className="px-3 py-3 font-medium">Effect</th>
                <th className="px-3 py-3 font-medium">Reason</th>
                <th className="px-3 py-3 font-medium">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-3 py-3 text-foreground">{entry.capability}</td>
                  <td className="px-3 py-3 text-foreground">
                    {entry.effect === "deny" ? "Explicit deny" : "Explicit allow"}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{entry.reason}</td>
                  <td className="px-3 py-3 text-foreground">
                    {entry.revokedAt ? "Revoked" : "Expired"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AdminAccessRoute() {
  const search = Route.useSearch();
  const loaded = Route.useLoaderData();
  const { profile } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const requestsQuery = useQuery({ ...requestsQueryOptions(search), initialData: loaded.requests });
  const usersQuery = useQuery({
    ...usersQueryOptions(),
    initialData: { items: loaded.users, total: loaded.users.length, page: 1, limit: 100 },
  });
  const selectedUser =
    usersQuery.data.items.find((user) => user.id === (search.profile ?? loaded.selectedUser?.id)) ??
    loaded.selectedUser;
  const overridesQuery = useQuery({
    ...overridesQueryOptions(selectedUser?.id ?? "unselected"),
    initialData: loaded.overrides,
    enabled: Boolean(selectedUser),
  });
  const requests = requestsQuery.data;
  const users = usersQuery.data.items;
  const overrides = overridesQuery.data;
  const forbidden = loaded.forbidden;
  const [overrideOpen, setOverrideOpen] = useState(false);

  const updateSearch = (next: AdminAccessSearch) => navigate({ search: () => next, replace: true });
  const activeOverrides = overrides.filter((entry) => {
    return !entry.revokedAt && (!entry.expiresAt || Date.parse(entry.expiresAt) > Date.now());
  });

  async function refreshAdminAccessCaches(profileId?: string) {
    const auditKeys = queryClient
      .getQueriesData({ queryKey: crmQueryKeys.admin.lists() })
      .map(([queryKey]) => queryKey)
      .filter((queryKey) => (queryKey[2] as { scope?: string } | undefined)?.scope === "audit");
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: accessRequestsQueryKey(search), exact: true }),
      queryClient.invalidateQueries({ queryKey: adminOverviewQueryKey, exact: true }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.shell(), exact: true }),
      ...auditKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey, exact: true })),
    ];
    if (profileId) {
      invalidations.push(
        queryClient.invalidateQueries({
          queryKey: accessOverridesQueryKey(profileId),
          exact: true,
        }),
      );
    }
    await Promise.all(invalidations);
  }
  async function decide(input: AccessRequestDecision) {
    await decideAdminAccessRequestFn({ data: input });
    toast.success(input.decision === "approved" ? "Access approved" : "Access rejected");
    await refreshAdminAccessCaches(selectedUser?.id);
  }

  async function createOverride(input: PermissionOverrideSubmit) {
    await createAdminPermissionOverrideFn({
      data: {
        profileId: input.profileId,
        capability: input.capability,
        effect: input.effect,
        reason: input.reason,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      },
    });
    toast.success("Permission override created");
    await refreshAdminAccessCaches(input.profileId);
  }

  if (forbidden) {
    return (
      <div
        role="alert"
        className="m-6 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-5 text-sm text-destructive"
      >
        Access review is outside your access scope.
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-border px-4 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Admin workspace
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Access review</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Decide requested access and inspect effective permissions without hiding history.
            </p>
          </div>
          <label className="block min-w-56">
            <span className="text-xs font-medium text-muted-foreground">Profile</span>
            <select
              aria-label="Access profile"
              value={selectedUser?.id ?? ""}
              onChange={(event) =>
                updateSearch({ ...search, profile: event.target.value || undefined })
              }
              className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.email || user.id}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="border-b border-border px-4 py-3">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Access review tabs">
          {(["requests", "effective"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={search.tab === tab}
              onClick={() => updateSearch({ ...search, tab })}
              className={
                "min-h-9 shrink-0 rounded-md px-3 py-2 text-sm font-medium capitalize " +
                (search.tab === tab
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent")
              }
            >
              {tab === "requests" ? "Requests" : "Effective access"}
            </button>
          ))}
        </div>
      </div>
      {search.tab === "requests" ? (
        <AccessRequestQueue
          requests={requests}
          actorRole={profile?.role ?? "read_only"}
          onDecide={decide}
        />
      ) : selectedUser ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {selectedUser.name || selectedUser.email || selectedUser.id}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Role defaults are separated from active explicit overrides.
              </p>
            </div>
            {profile?.role === "super_admin" ? (
              <button
                type="button"
                onClick={() => setOverrideOpen(true)}
                className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Create override
              </button>
            ) : null}
          </div>
          <EffectiveAccessTable
            roleDefaults={CAPABILITIES.map((capability) => ({
              capability,
              allowed: ROLE_GRANTS[selectedUser.role].has(capability),
            }))}
            overrides={activeOverrides}
          />
          <OverrideHistory overrides={overrides} />
        </>
      ) : (
        <p className="px-4 py-8 text-sm text-muted-foreground">
          Select an active profile to inspect effective access.
        </p>
      )}
      {selectedUser ? (
        <PermissionOverrideDialog
          open={overrideOpen}
          profileId={selectedUser.id}
          profileName={selectedUser.name || selectedUser.email || selectedUser.id}
          canCreateOverride={profile?.role === "super_admin"}
          onOpenChange={setOverrideOpen}
          onSubmit={createOverride}
        />
      ) : null}
    </>
  );
}
