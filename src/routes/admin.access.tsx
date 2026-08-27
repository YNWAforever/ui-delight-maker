import { useRef, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

import {
  AccessRequestQueue,
  type AccessRequestDecision,
} from "@/components/admin/access-request-queue";
import { EffectiveAccessTable, OverrideHistory } from "@/components/admin/effective-access-table";
import {
  PermissionOverrideDialog,
  type PermissionOverrideSubmit,
} from "@/components/admin/permission-override-dialog";
import {
  EmptyWorkspaceState,
  ErrorState,
  PermissionDeniedState,
  SectionHeader,
  WorkspaceHeader,
} from "@/components/sales";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { adminControlAccess } from "@/lib/admin-capabilities";
import {
  adminOrganizationQueryKey,
  adminOrganizationUnitQueryKey,
  departmentOptions,
  loadOrganizationDirectory,
  teamOptions,
} from "@/lib/admin-directory";
import { refreshAdminCapabilityScope } from "@/lib/admin-invalidation";
import { AdminError } from "@/lib/admin/errors";
import { ROLE_GRANTS } from "@/lib/admin/policy";
import { adminAccessSearchSchema, type AdminAccessSearch } from "@/lib/admin/schemas";
import { CAPABILITIES } from "@/lib/admin/types";
import { toSafeErrorMessage } from "@/lib/errors";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getUserRoleLabel } from "@/lib/status-labels";
import type { PermissionOverrideRecord } from "@/server/repositories/admin-access";
import {
  createAdminPermissionOverrideFn,
  decideAdminAccessRequestFn,
  getAdminAccessRequestsFn,
  revokeAdminPermissionOverrideFn,
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
const organizationQueryOptions = () =>
  routeQueryOptions({ queryKey: adminOrganizationQueryKey, queryFn: loadOrganizationDirectory });

/** The five states `adminAccessSearchSchema.requestStatus` accepts, with their wording. */
const REQUEST_STATE_OPTIONS = [
  { value: "pending", label: "Waiting approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "Every state" },
] as const;

export const Route = createFileRoute("/admin/access")({
  validateSearch: adminAccessSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, deps: { search } }) => {
    try {
      const requestedProfileId = search.profile;
      const [requests, users, requestedOverrides, organization] = await Promise.all([
        context.queryClient.ensureQueryData(requestsQueryOptions(search)),
        context.queryClient.ensureQueryData(usersQueryOptions()),
        requestedProfileId
          ? context.queryClient.ensureQueryData(overridesQueryOptions(requestedProfileId))
          : Promise.resolve([] as PermissionOverrideRecord[]),
        // Loaded so the override dialog can offer real departments and teams as scope.
        context.queryClient.ensureQueryData(organizationQueryOptions()),
      ]);
      const selectedProfileId = requestedProfileId ?? users.items[0]?.id;
      const selectedUser = users.items.find((user) => user.id === selectedProfileId) ?? null;
      const overrides =
        selectedProfileId && selectedProfileId !== requestedProfileId
          ? await context.queryClient.ensureQueryData(overridesQueryOptions(selectedProfileId))
          : requestedOverrides;
      return {
        requests,
        users: users.items,
        selectedUser,
        overrides,
        organization,
        forbidden: false,
      };
    } catch (error) {
      if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
        return {
          requests: [],
          users: [],
          selectedUser: null,
          overrides: [],
          organization: undefined,
          forbidden: true,
        };
      }
      throw error;
    }
  },
  head: () => ({ meta: [{ title: "Access review · Admin · Fimmick ClientOps" }] }),
  errorComponent: AdminAccessErrorState,
  component: AdminAccessRoute,
});

function AdminAccessErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Access review did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/admin/access" });
        }}
      />
    </div>
  );
}

function AdminAccessRoute() {
  const search = Route.useSearch();
  const loaded = Route.useLoaderData();
  const { profile } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const queryClient = useQueryClient();
  const writeLock = useRef(false);

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
  const organizationQuery = useQuery({
    ...organizationQueryOptions(),
    initialData: loaded.organization,
    enabled: !loaded.forbidden,
  });

  const requests = requestsQuery.data;
  const users = usersQuery.data.items;
  const overrides = overridesQuery.data;
  const forbidden = loaded.forbidden;
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<PermissionOverrideRecord | null>(null);

  const access = adminControlAccess(profile?.role);
  const updateSearch = (next: AdminAccessSearch) => navigate({ search: () => next, replace: true });
  const activeOverrides = overrides.filter(
    (entry) => !entry.revokedAt && (!entry.expiresAt || Date.parse(entry.expiresAt) > Date.now()),
  );

  async function refreshAdminAccessCaches(profileId?: string, teamId?: string) {
    const adminListKeys = queryClient
      .getQueriesData({ queryKey: crmQueryKeys.admin.lists() })
      .map(([queryKey]) => queryKey);
    const requestKeys = adminListKeys.filter(
      (queryKey) => (queryKey[2] as { scope?: string } | undefined)?.scope === "access-requests",
    );
    const auditKeys = adminListKeys.filter(
      (queryKey) => (queryKey[2] as { scope?: string } | undefined)?.scope === "audit",
    );
    const keys = [
      accessUsersQueryKey,
      adminOverviewQueryKey,
      crmQueryKeys.shell(),
      ...requestKeys,
      ...auditKeys,
    ];
    if (profileId) {
      keys.push(accessOverridesQueryKey(profileId), crmQueryKeys.admin.detail(profileId));
    }
    if (teamId) {
      keys.push(adminOrganizationQueryKey, adminOrganizationUnitQueryKey("team", teamId));
    }
    await Promise.all(
      keys.map((queryKey) => queryClient.invalidateQueries({ queryKey, exact: true })),
    );
    // Every write on this screen changes what somebody may do, so the admin rail — which
    // resolves in a `beforeLoad`, outside the query cache — is re-resolved too.
    await refreshAdminCapabilityScope(router);
  }

  async function decide(input: AccessRequestDecision) {
    const request = requests.find((item) => item.id === input.id);
    await decideAdminAccessRequestFn({ data: input });
    toast.success(input.decision === "approved" ? "Access approved" : "Access rejected");
    await refreshAdminAccessCaches(request?.requesterProfileId, request?.teamId ?? undefined);
  }

  async function createOverride(input: PermissionOverrideSubmit) {
    await createAdminPermissionOverrideFn({
      data: {
        profileId: input.profileId,
        capability: input.capability,
        effect: input.effect,
        reason: input.reason,
        // The four scope fields the schema and `overrideIsActive` have always accepted, and
        // that this route silently dropped — so every override it created was org-wide.
        ...(input.departmentId ? { departmentId: input.departmentId } : {}),
        ...(input.teamId ? { teamId: input.teamId } : {}),
        ...(input.resourceType ? { resourceType: input.resourceType } : {}),
        ...(input.resourceId ? { resourceId: input.resourceId } : {}),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      },
    });
    toast.success("Permission override created");
    await refreshAdminAccessCaches(input.profileId, input.teamId ?? undefined);
  }

  async function revokeOverride(override: PermissionOverrideRecord) {
    if (writeLock.current) return;
    writeLock.current = true;
    setRevokingId(override.id);
    try {
      await revokeAdminPermissionOverrideFn({ data: { id: override.id } });
      await refreshAdminAccessCaches(override.profileId, override.teamId ?? undefined);
      toast.success("Override revoked. The role baseline applies again.");
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      writeLock.current = false;
      setRevokingId(null);
      setRevokeTarget(null);
    }
  }

  if (forbidden) {
    return (
      <>
        <WorkspaceHeader context="Administration" title="Access review" />
        <div className="px-4 py-6 md:px-6">
          <PermissionDeniedState what="Access review" />
        </div>
      </>
    );
  }

  const pendingCount = requests.filter((request) => request.status === "pending").length;

  return (
    <>
      <WorkspaceHeader
        context="Administration"
        title="Access review"
        description={
          search.tab === "requests"
            ? `${pendingCount} request${pendingCount === 1 ? "" : "s"} waiting on a decision in this view.`
            : "Role defaults and explicit overrides for one person, kept separate so an exception is never mistaken for a role."
        }
        primaryAction={
          search.tab === "effective" && selectedUser && access.overridePermissions ? (
            <Button size="sm" onClick={() => setOverrideOpen(true)}>
              <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
              Create override
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-4 md:px-6">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Access review tabs">
          {(["requests", "effective"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={search.tab === tab}
              onClick={() => updateSearch({ ...search, tab })}
              className={
                "min-h-9 shrink-0 rounded-md px-3 py-2 text-sm font-medium " +
                (search.tab === tab
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent")
              }
            >
              {tab === "requests" ? "Requests" : "Effective access"}
            </button>
          ))}
        </div>

        {search.tab === "requests" ? (
          /*
            `requestStatus` supports five values, the query key includes it and the read
            forwards it — the entire path was wired with no control anywhere to change it, so
            the queue was pinned to `pending` unless the URL was hand-edited. That is also
            what hid the hardcoded "Pending" pill on every row.
          */
          <label className="block min-w-52">
            <span className="text-xs font-medium text-muted-foreground">Request state</span>
            <select
              aria-label="Request state"
              value={search.requestStatus}
              onChange={(event) =>
                updateSearch({
                  ...search,
                  requestStatus: event.target.value as AdminAccessSearch["requestStatus"],
                })
              }
              className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {REQUEST_STATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
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
        )}
      </div>

      {search.tab === "requests" ? (
        <AccessRequestQueue
          requests={requests}
          actorRole={profile?.role ?? "read_only"}
          actorProfileId={profile?.id ?? null}
          filtered={search.requestStatus !== "pending"}
          onDecide={decide}
        />
      ) : selectedUser ? (
        <>
          <div className="px-4 pt-6 md:px-6">
            <SectionHeader
              title={selectedUser.name || selectedUser.email || selectedUser.id}
              description={`Role baseline: ${getUserRoleLabel(selectedUser.role)}. Overrides below are consulted before it.`}
            />
          </div>
          <EffectiveAccessTable
            roleDefaults={CAPABILITIES.map((capability) => ({
              capability,
              allowed: ROLE_GRANTS[selectedUser.role].has(capability),
            }))}
            overrides={activeOverrides}
            revokingId={revokingId}
            /*
              `revokeAdminPermissionOverrideFn` has existed, been authorized on
              `permissions.override`, and been imported by no route — so the history table
              rendered a "Revoked" state nothing in the product could produce, and a
              permanent override created here could only be undone with direct SQL.
            */
            onRevoke={access.overridePermissions ? setRevokeTarget : undefined}
          />
          <OverrideHistory overrides={overrides} />
        </>
      ) : (
        <div className="px-4 py-6 md:px-6">
          <EmptyWorkspaceState
            title="No active profile to inspect"
            description="Effective access is reviewed one person at a time. Invite or reactivate someone first."
          />
        </div>
      )}

      {selectedUser ? (
        <PermissionOverrideDialog
          open={overrideOpen}
          profileId={selectedUser.id}
          profileName={selectedUser.name || selectedUser.email || selectedUser.id}
          canCreateOverride={access.overridePermissions}
          departments={departmentOptions(organizationQuery.data)}
          teams={teamOptions(organizationQuery.data)}
          onOpenChange={setOverrideOpen}
          onSubmit={createOverride}
        />
      ) : null}

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke the {revokeTarget?.effect === "deny" ? "explicit deny" : "explicit allow"} on{" "}
              {revokeTarget?.capability}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This override stops applying immediately and the person falls back to their role
              baseline — which may take access away, or give it back if the override was a deny. The
              revocation is recorded in the audit log and the override stays visible in the history
              below. It cannot be un-revoked; a new override would have to be created.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokingId !== null}>Keep override</AlertDialogCancel>
            <AlertDialogAction
              disabled={revokingId !== null}
              onClick={(event) => {
                event.preventDefault();
                if (revokeTarget) void revokeOverride(revokeTarget);
              }}
            >
              Revoke override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
