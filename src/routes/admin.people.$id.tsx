import { useRef, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { EffectiveAccessTable, OverrideHistory } from "@/components/admin/effective-access-table";
import { UserDetailPanel } from "@/components/admin/user-detail-panel";
import {
  EmptyWorkspaceState,
  ErrorState,
  PermissionDeniedState,
  SectionHeader,
  StatusBadge,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminControlAccess } from "@/lib/admin/control-access";
import { refreshAdminCapabilityScope } from "@/lib/admin-invalidation";
import { AdminError } from "@/lib/admin/errors";
import { ROLE_GRANTS } from "@/lib/admin/policy";
import { adminUserDetailSearchSchema } from "@/lib/admin/schemas";
import { CAPABILITIES } from "@/lib/admin/types";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount, formatDateTime } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getUserRoleLabel } from "@/lib/status-labels";
import type { PermissionOverrideRecord } from "@/server/repositories/admin-access";
import { getAdminOverridesFn } from "@/server-functions/admin-access";
import { getAdminUserFn, revokeAdminUserSessionsFn } from "@/server-functions/admin-users";

const adminUserQuery = (profileId: string) =>
  routeQueryOptions({
    queryKey: crmQueryKeys.admin.detail(profileId),
    queryFn: () => getAdminUserFn({ data: { profileId } }),
  });

/**
 * The same override read `/admin/access` uses, under the same key.
 *
 * The Access tab used to be a tab labelled "Access" whose entire body was one sentence of
 * prose plus "Base role: sales" — no grants, no overrides, no fetch — while the identical
 * view already existed and worked one route away. A denial degrades to an empty list rather
 * than failing the page: an actor may hold `users.view` without `permissions.view`, and the
 * tab then says it cannot show overrides instead of taking the record down with it.
 */
const overridesQuery = (profileId: string) =>
  routeQueryOptions({
    queryKey: crmQueryKeys.admin.section(profileId, "access-overrides", { includeHistory: true }),
    queryFn: async () => {
      try {
        return {
          overrides: (await getAdminOverridesFn({
            data: { profileId, includeHistory: true },
          })) as PermissionOverrideRecord[],
          permitted: true,
        };
      } catch (error) {
        if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
          return { overrides: [] as PermissionOverrideRecord[], permitted: false };
        }
        throw error;
      }
    },
  });

export const Route = createFileRoute("/admin/people/$id")({
  validateSearch: adminUserDetailSearchSchema,
  loader: async ({ context, params }) => {
    try {
      const [user, access] = await Promise.all([
        context.queryClient.ensureQueryData(adminUserQuery(params.id)),
        context.queryClient.ensureQueryData(overridesQuery(params.id)),
      ]);
      return { user, access, forbidden: false };
    } catch (error) {
      if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
        return {
          user: null,
          access: { overrides: [] as PermissionOverrideRecord[], permitted: false },
          forbidden: true,
        };
      }
      throw error;
    }
  },
  head: () => ({ meta: [{ title: "User record · People · Fimmick ClientOps" }] }),
  errorComponent: AdminUserErrorState,
  component: AdminUserRoute,
});

function AdminUserErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="This user record did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/admin/people/$id" });
        }}
      />
    </div>
  );
}

function AdminUserRoute() {
  const search = Route.useSearch();
  const params = Route.useParams();
  const loaderData = Route.useLoaderData();
  const { profile, capabilities } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const queryClient = useQueryClient();
  const revokeLock = useRef(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const { data: userData } = useQuery({
    ...adminUserQuery(params.id),
    initialData: loaderData.user ?? undefined,
    enabled: !loaderData.forbidden,
  });
  const accessQuery = useQuery({
    ...overridesQuery(params.id),
    initialData: loaderData.access,
    enabled: !loaderData.forbidden,
  });

  const user = userData ?? null;
  const access = adminControlAccess(capabilities);

  if (loaderData.forbidden) {
    return (
      <>
        <WorkspaceHeader
          context="Administration"
          title="User record"
          backHref={{ to: "/admin/people", label: "Back to People" }}
        />
        <div className="px-4 py-6 md:px-6">
          <PermissionDeniedState what="this user record" />
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <WorkspaceHeader
          context="Administration"
          title="User record"
          backHref={{ to: "/admin/people", label: "Back to People" }}
        />
        <div className="px-4 py-6 md:px-6">
          <EmptyWorkspaceState
            title="That user record no longer exists"
            description="It may have been removed, or the link may be out of date."
          />
        </div>
      </>
    );
  }

  const name = user.name || user.email || "Unnamed user";
  const overrides = accessQuery.data.overrides;
  const activeOverrides = overrides.filter(
    (entry) => !entry.revokedAt && (!entry.expiresAt || Date.parse(entry.expiresAt) > Date.now()),
  );

  const revokeSessions = async () => {
    if (revokeLock.current) return;
    revokeLock.current = true;
    setRevoking(true);
    try {
      await revokeAdminUserSessionsFn({ data: { profileId: user.id } });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: crmQueryKeys.admin.detail(user.id),
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: crmQueryKeys.admin.lists() }),
        queryClient.invalidateQueries({
          queryKey: crmQueryKeys.admin.section("overview", "summary"),
          exact: true,
        }),
      ]);
      // Revoking sessions changes what this actor's own shell may show if they revoked
      // themselves, so the rail is re-resolved with everything else.
      await refreshAdminCapabilityScope(router);
      toast.success(`${name} has been signed out of every session.`);
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      revokeLock.current = false;
      setRevoking(false);
      setConfirmRevoke(false);
    }
  };

  return (
    <>
      <WorkspaceHeader
        context="Administration"
        title={name}
        description={`${getUserRoleLabel(user.role)} · ${user.email || "No email"}`}
        backHref={{ to: "/admin/people", label: "Back to People" }}
        status={<StatusBadge domain="adminProfiles" value={user.status} />}
      />
      <div className="px-4 py-6 md:px-6">
        <Tabs
          value={search.tab ?? "profile"}
          onValueChange={(tab) =>
            navigate({
              search: (current) => ({
                ...current,
                tab: tab === "profile" ? undefined : (tab as NonNullable<typeof search.tab>),
              }),
              replace: true,
            })
          }
        >
          <div className="max-w-full overflow-x-auto pb-1">
            <TabsList className="w-max">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="access">Access</TabsTrigger>
              <TabsTrigger value="teams">Teams</TabsTrigger>
              <TabsTrigger value="work">Work</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="profile" className="mt-4">
            <div className="rounded-md border border-border">
              <UserDetailPanel user={user} />
            </div>
          </TabsContent>

          <TabsContent value="access" className="mt-4">
            {accessQuery.data.permitted ? (
              <div className="rounded-md border border-border">
                <EffectiveAccessTable
                  roleDefaults={CAPABILITIES.map((capability) => ({
                    capability,
                    allowed: ROLE_GRANTS[user.role].has(capability),
                  }))}
                  overrides={activeOverrides}
                />
                <OverrideHistory overrides={overrides} />
              </div>
            ) : (
              <PermissionDeniedState what="effective access" />
            )}
          </TabsContent>

          <TabsContent value="teams" className="mt-4">
            <section className="space-y-3 rounded-md border border-border px-4 py-5">
              <SectionHeader
                title="Current teams"
                description="Memberships end rather than disappear, so the history stays reviewable."
              />
              {user.teams && user.teams.length > 0 ? (
                <ul className="divide-y divide-border">
                  {user.teams.map((team) => (
                    <li
                      key={team.teamId}
                      className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                    >
                      <span className="font-medium text-foreground">{team.teamName}</span>
                      <span className="capitalize text-muted-foreground">
                        {team.membershipRole}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyWorkspaceState
                  title="No active team memberships"
                  description="Add this person to a team from the Teams workspace."
                />
              )}
            </section>
          </TabsContent>

          <TabsContent value="work" className="mt-4">
            <section className="space-y-3 rounded-md border border-border px-4 py-5">
              <SectionHeader
                title="Assigned workload"
                description="What has to be reassigned before this profile can be deactivated."
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(user.workload ?? {}).map(([key, value]) => (
                  <div key={key} className="rounded-md bg-muted/30 px-3 py-3">
                    <p className="text-xs capitalize text-muted-foreground">
                      {key.replace(/([A-Z])/g, " $1")}
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                      {formatCount(Number(value))}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="security" className="mt-4">
            <section className="space-y-4 rounded-md border border-border px-4 py-5">
              <SectionHeader
                title="Security state"
                description="Session revocation is immediate and is recorded in the administrative audit log."
              />
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Account status</dt>
                  <dd className="mt-1">
                    <StatusBadge domain="adminProfiles" value={user.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Sessions invalidated before</dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {user.sessionInvalidBefore
                      ? formatDateTime(user.sessionInvalidBefore)
                      : "No session revocation recorded"}
                  </dd>
                </div>
              </dl>
              {/*
                `revokeAdminUserSessionsFn` has existed, been authorized on `sessions.revoke`
                and been imported by no route at all. `/account` has the self-service
                equivalent; the admin-side one simply did not exist, so this tab could state
                the fact and do nothing about it. Subordinate styling and a confirmation
                dialog, because signing a colleague out mid-task is disruptive and immediate.
              */}
              {access.revokeSessions ? (
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={revoking}
                    onClick={() => setConfirmRevoke(true)}
                  >
                    <ShieldOff aria-hidden="true" className="mr-2 h-4 w-4" />
                    {revoking ? "Revoking…" : "Revoke every session"}
                  </Button>
                </div>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <section className="space-y-3 rounded-md border border-border px-4 py-5">
              <SectionHeader title="Activity" />
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Last active</dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {user.lastActiveAt ? formatDateTime(user.lastActiveAt) : "Never active"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Created</dt>
                  <dd className="mt-1 text-sm text-foreground">{formatDateTime(user.createdAt)}</dd>
                </div>
              </dl>
            </section>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign {name} out everywhere?</AlertDialogTitle>
            <AlertDialogDescription>
              Every session this person currently holds stops working immediately and they have to
              sign in again — including anything they have open right now. Their role, teams and
              work are untouched. The revocation is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={revoking}
              onClick={(event) => {
                event.preventDefault();
                void revokeSessions();
              }}
            >
              Revoke sessions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
