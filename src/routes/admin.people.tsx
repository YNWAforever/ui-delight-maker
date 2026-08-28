import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import { InviteUsersDialog } from "@/components/admin/invite-users-dialog";
import { PeopleDirectory } from "@/components/admin/people-directory";
import { UserDetailPanel } from "@/components/admin/user-detail-panel";
import {
  UserLifecycleDialog,
  type UserLifecycleSubmit,
} from "@/components/admin/user-lifecycle-dialog";
import { UserRoleDialog } from "@/components/admin/user-role-dialog";
import type { LifecycleSuccessorOption } from "@/components/admin/work-reassignment-table";
import {
  ErrorState,
  PermissionDeniedState,
  StaleDataIndicator,
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
import { adminControlAccess } from "@/lib/admin/control-access";
import {
  adminOrganizationQueryKey,
  adminPeopleOptionsQueryKey,
  departmentOptions,
  loadActiveProfiles,
  loadOrganizationDirectory,
  teamOptions,
} from "@/lib/admin-directory";
import { refreshAdminCapabilityScope } from "@/lib/admin-invalidation";
import { AdminError } from "@/lib/admin/errors";
import { adminPeopleSearchSchema, type AdminPeopleSearch } from "@/lib/admin/schemas";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { useIsExactPath } from "@/lib/routing-utils";
import type { ReassignmentInventory } from "@/server/admin/reassignment.server";
import { inviteUsers } from "@/server-functions/admin-invitations";
import {
  changeAdminUserRoleFn,
  deactivateAdminUserWithReassignmentFn,
  getAdminReassignmentInventoryFn,
  getAdminUserFn,
  getAdminUsersFn,
  reactivateAdminUserFn,
  revokeAdminUserSessionsFn,
  suspendAdminUserFn,
} from "@/server-functions/admin-users";

function toUserFilters(search: AdminPeopleSearch) {
  return {
    search: search.q,
    role: search.role,
    status: search.status,
    departmentId: search.department,
    teamId: search.team,
    page: search.page,
    limit: 50,
  };
}

const peopleDirectoryQuery = (search: AdminPeopleSearch) =>
  routeQueryOptions({
    queryKey: crmQueryKeys.admin.list({ resource: "people", ...toUserFilters(search) }),
    queryFn: () => getAdminUsersFn({ data: toUserFilters(search) }),
  });

const adminUserQuery = (profileId: string) =>
  routeQueryOptions({
    queryKey: crmQueryKeys.admin.detail(profileId),
    queryFn: () => getAdminUserFn({ data: { profileId } }),
  });

const organizationQuery = () =>
  routeQueryOptions({
    queryKey: adminOrganizationQueryKey,
    queryFn: loadOrganizationDirectory,
  });

const activeProfilesQuery = () =>
  routeQueryOptions({
    queryKey: adminPeopleOptionsQueryKey(),
    queryFn: loadActiveProfiles,
  });

export const Route = createFileRoute("/admin/people")({
  validateSearch: adminPeopleSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, deps: { search } }) => {
    const directoryPromise = context.queryClient.ensureQueryData(peopleDirectoryQuery(search));
    const selectedUserPromise = search.user
      ? context.queryClient.ensureQueryData(adminUserQuery(search.user)).catch((error) => {
          if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
            return null;
          }
          throw error;
        })
      : Promise.resolve(null);

    /**
     * The organization is loaded here so the invite dialog can offer real departments,
     * managers and teams.
     *
     * Without it the dialog degraded to free-text boxes labelled "Department ID (optional)"
     * and "Manager profile ID (optional)", and the Initial-teams fieldset never rendered at
     * all — so `initialTeamIds` was always `[]`. That is the exact field
     * `requireInvitationTargets` uses to scope a manager's invite authority, so a manager
     * could not send a scoped invitation from this screen at all. Both reads degrade to
     * empty for an actor without the capability, so this cannot fail the page.
     */
    const optionsPromise = Promise.all([
      context.queryClient.ensureQueryData(organizationQuery()),
      context.queryClient.ensureQueryData(activeProfilesQuery()),
    ]);

    try {
      const [directory, selectedUser] = await Promise.all([directoryPromise, selectedUserPromise]);
      await optionsPromise;
      return { directory, selectedUser, forbidden: false };
    } catch (error) {
      if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
        return { directory: undefined, selectedUser: null, forbidden: true };
      }
      throw error;
    }
  },
  head: () => ({ meta: [{ title: "People · Admin · Fimmick ClientOps" }] }),
  errorComponent: AdminPeopleErrorState,
  component: AdminPeopleRoute,
});

function AdminPeopleErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="The people directory did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/admin/people" });
        }}
      />
    </div>
  );
}

/**
 * `/admin/people/$id` is a child of this route, and this component never rendered an
 * `Outlet`.
 *
 * So the child's loader ran, its component never mounted, and navigating to a person's full
 * record re-rendered this directory with no `?user=` — the panel read "Select a person to
 * review their record." Every other nested parent in the repo (`accounts.tsx`, `leads.tsx`,
 * `quotes.tsx`) uses exactly this idiom; these two admin parents were the only ones that did
 * not.
 */
function AdminPeopleRoute() {
  const isIndexRoute = useIsExactPath("/admin/people");
  if (!isIndexRoute) return <Outlet />;
  return <AdminPeopleIndex />;
}

function AdminPeopleIndex() {
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const { profile, capabilities } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const queryClient = useQueryClient();

  const directoryQuery = useQuery({
    ...peopleDirectoryQuery(search),
    initialData: loaderData.directory,
    enabled: !loaderData.forbidden,
  });
  const { data: selectedUserData } = useQuery({
    ...adminUserQuery(search.user ?? "unselected"),
    initialData: loaderData.selectedUser ?? undefined,
    enabled: !loaderData.forbidden && Boolean(search.user),
  });
  const organization = useQuery({ ...organizationQuery(), enabled: !loaderData.forbidden });
  const activeProfiles = useQuery({ ...activeProfilesQuery(), enabled: !loaderData.forbidden });

  const directory = directoryQuery.data;
  const selectedUser = selectedUserData ?? null;
  const forbidden = loaderData.forbidden;

  const lifecycleRequest = useRef(0);
  const writeLock = useRef(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleUser, setRoleUser] = useState(selectedUser);
  const [lifecycleUser, setLifecycleUser] = useState(selectedUser);
  const [lifecycleInventory, setLifecycleInventory] = useState<ReassignmentInventory>();
  const [lifecycleSuccessors, setLifecycleSuccessors] = useState<LifecycleSuccessorOption[]>([]);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<"suspend" | "reactivate">("suspend");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    title: string;
    description: string;
    label: string;
    run: () => Promise<void>;
  }>(null);

  const updateSearch = (next: AdminPeopleSearch) => navigate({ search: () => next, replace: true });

  /**
   * Advisory gating from the role baseline the client can see.
   *
   * "Change role" was the one control here that was wired unconditionally while Invite and
   * Manage-lifecycle beside it were gated, so `read_only` — which legitimately holds
   * `users.view` — was offered a dialog it could fill in and submit before being refused.
   */
  const access = adminControlAccess(capabilities);

  const departments = departmentOptions(organization.data);
  const teams = teamOptions(organization.data);
  const managers = activeProfiles.data ?? [];

  /**
   * Everything a change to a person can make stale.
   *
   * The previous set stopped at `admin.lists()`, the overview and the person's own detail.
   * It missed the picker key `/admin/teams` and `/admin/teams/$id` read, so after a suspend
   * or a deactivate the organization screens went on offering the removed person as an
   * active member or successor straight from cache. `router.invalidate` on `/admin` is the
   * other half: the admin rail resolves its navigation in a `beforeLoad`, outside the query
   * cache, so a role change that removes `audit.view` left the Audit tab in the rail until a
   * hard reload.
   */
  const refreshPeople = async (profileId?: string, capabilityAffecting = false) => {
    const refreshes = [
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.admin.lists() }),
      queryClient.invalidateQueries({
        queryKey: crmQueryKeys.admin.section("overview", "summary"),
        exact: true,
      }),
      queryClient.invalidateQueries({ queryKey: adminPeopleOptionsQueryKey(), exact: true }),
      queryClient.invalidateQueries({ queryKey: adminOrganizationQueryKey, exact: true }),
    ];
    if (profileId) {
      refreshes.push(
        queryClient.invalidateQueries({
          queryKey: crmQueryKeys.admin.detail(profileId),
          exact: true,
        }),
      );
    }
    if (capabilityAffecting) {
      refreshes.push(
        queryClient.invalidateQueries({ queryKey: crmQueryKeys.shell(), exact: true }),
      );
    }
    await Promise.all(refreshes);
    if (capabilityAffecting) await refreshAdminCapabilityScope(router);
  };

  /**
   * One in-flight lock for every write on this screen.
   *
   * There is no `useMutation` in this codebase, so the guarantees Instruction §12.3 asks for
   * are spelled out: refuse a re-entrant call, report a sanitized failure, invalidate on the
   * way out, and never toast a success for a call that threw.
   */
  const runWrite = async (work: () => Promise<void>) => {
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy(true);
    try {
      await work();
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      writeLock.current = false;
      setBusy(false);
    }
  };

  /**
   * Opens the lifecycle dialog, loading the ownership inventory only when it is needed.
   *
   * `getAdminReassignmentInventoryFn` requires `users.deactivate`, which Super Admin and
   * Admin hold and Manager does not — while reactivation only needs `users.manage`, which
   * Manager does hold. Fetching the inventory unconditionally would therefore have made the
   * newly wired reactivate path fail for exactly the role it was added for: the denial would
   * close the dialog with an error before the manager could type a reason.
   */
  const openLifecycle = async (intent: "reactivate" | "manage") => {
    if (!selectedUser) return;
    const requestNumber = ++lifecycleRequest.current;
    setLifecycleAction(intent === "reactivate" ? "reactivate" : "suspend");
    setLifecycleUser(selectedUser);
    setLifecycleInventory(undefined);
    setLifecycleSuccessors([]);
    if (intent === "reactivate" || !access.deactivate) {
      setLifecycleLoading(false);
      return;
    }

    setLifecycleLoading(true);
    try {
      const [inventory, candidates] = await Promise.all([
        getAdminReassignmentInventoryFn({ data: { profileId: selectedUser.id } }),
        getAdminUsersFn({ data: { status: "active", page: 1, limit: 100 } }),
      ]);
      if (requestNumber !== lifecycleRequest.current) return;
      setLifecycleInventory(inventory);
      setLifecycleSuccessors(
        candidates.items.filter((candidate) => candidate.id !== selectedUser.id),
      );
    } catch (error) {
      if (requestNumber !== lifecycleRequest.current) return;
      setLifecycleUser(null);
      // `getAdminReassignmentInventoryFn` reaches `loadAuthorizationContext`, which runs four
      // raw SQL queries; a driver failure used to reach this toast verbatim.
      toast.error(toSafeErrorMessage(error));
    } finally {
      if (requestNumber === lifecycleRequest.current) setLifecycleLoading(false);
    }
  };

  const closeLifecycle = (open: boolean) => {
    if (!open) {
      lifecycleRequest.current += 1;
      setLifecycleUser(null);
      setLifecycleInventory(undefined);
      setLifecycleSuccessors([]);
      setLifecycleLoading(false);
    }
  };

  /**
   * The lifecycle dialog owns its own error surface, so this throws rather than toasting:
   * the dialog stays open with the message beside the reason the admin just typed.
   */
  const submitLifecycle = async (input: UserLifecycleSubmit) => {
    if (input.action === "suspend") {
      await suspendAdminUserFn({ data: { profileId: input.profileId, reason: input.reason } });
      toast.success("User suspended. Their sessions are invalidated.");
    } else if (input.action === "reactivate") {
      await reactivateAdminUserFn({ data: { profileId: input.profileId, reason: input.reason } });
      toast.success("User reactivated. They can sign in again.");
    } else {
      await deactivateAdminUserWithReassignmentFn({
        data: {
          profileId: input.profileId,
          reason: input.reason,
          reviewedInventory: input.reviewedInventory,
          successors: input.successors,
        },
      });
      toast.success("User deactivated and their open work reassigned.");
    }
    closeLifecycle(false);
    // A lifecycle change removes or restores access, so the rail and the shell move with it.
    await refreshPeople(input.profileId, true);
  };

  const revokeSessions = (profileId: string, name: string) =>
    setConfirm({
      title: `Sign ${name} out everywhere?`,
      description:
        "Every session this person currently holds stops working immediately and they have to sign in again. Their role, teams and work are untouched, and the revocation is recorded in the audit log.",
      label: "Revoke sessions",
      run: async () => {
        await revokeAdminUserSessionsFn({ data: { profileId } });
        await refreshPeople(profileId, true);
        toast.success(`${name} has been signed out of every session.`);
      },
    });

  if (forbidden) {
    return (
      <>
        <WorkspaceHeader context="Administration" title="People" />
        <div className="px-4 py-6 md:px-6">
          <PermissionDeniedState what="People administration" />
        </div>
      </>
    );
  }

  const total = directory?.total ?? 0;
  const selectedName = selectedUser?.name || selectedUser?.email || "This person";

  return (
    <>
      <WorkspaceHeader
        context="Administration"
        title="People"
        description={`${formatCount(total)} ${total === 1 ? "person" : "people"} in this workspace. Find someone, review their access, and keep ownership clear.`}
        status={
          <StaleDataIndicator
            updatedAt={new Date(directoryQuery.dataUpdatedAt).toISOString()}
            isRefetching={directoryQuery.isFetching}
          />
        }
        primaryAction={
          access.invite ? (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
              Invite users
            </Button>
          ) : undefined
        }
      />

      <div className="grid min-w-0 md:grid-cols-[minmax(0,1fr)_20rem]">
        <PeopleDirectory
          data={directory}
          search={search}
          selectedUserId={search.user}
          onSearchChange={updateSearch}
          onSelectUser={(profileId) => updateSearch({ ...search, user: profileId })}
          departments={departments}
          teams={teams}
        />
        <div className="hidden md:block">
          <UserDetailPanel
            user={selectedUser}
            busy={busy}
            showFullRecordLink={Boolean(selectedUser)}
            onRoleChange={
              access.manageRole && selectedUser ? () => setRoleUser(selectedUser) : undefined
            }
            onReactivate={
              access.manageRole && selectedUser?.status === "suspended"
                ? () => void openLifecycle("reactivate")
                : undefined
            }
            onRevokeSessions={
              access.revokeSessions && selectedUser && selectedUser.status !== "deactivated"
                ? () => revokeSessions(selectedUser.id, selectedName)
                : undefined
            }
            onLifecycle={
              access.suspend && selectedUser && selectedUser.status !== "deactivated"
                ? () => void openLifecycle("manage")
                : undefined
            }
          />
        </div>
      </div>

      <InviteUsersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        departments={departments}
        teams={teams}
        managers={managers}
        onSubmit={async (invitations) => {
          const result = await inviteUsers({ data: { invitations } });
          // The route no longer toasts "Invitation batch processed" unconditionally. The
          // dialog reports what the server said about delivery, and a batch whose email was
          // never dispatched must not produce two independent success signals.
          await refreshPeople();
          return result;
        }}
      />

      <UserRoleDialog
        open={Boolean(roleUser)}
        currentRole={roleUser?.role ?? "sales"}
        userName={roleUser?.name || roleUser?.email || "User"}
        onOpenChange={(open) => {
          if (!open) setRoleUser(null);
        }}
        onSubmit={async (role, reason) => {
          if (!roleUser) return;
          await changeAdminUserRoleFn({ data: { profileId: roleUser.id, role, reason } });
          toast.success("Role updated");
          setRoleUser(null);
          await refreshPeople(roleUser.id, true);
        }}
      />

      {lifecycleUser ? (
        <UserLifecycleDialog
          open
          user={lifecycleUser}
          initialAction={lifecycleAction}
          canReactivate={access.manageRole}
          /*
            Reactivate opens a reactivate-only dialog. The suspend and deactivate branches
            need the ownership inventory, which is deliberately not fetched on this path —
            offering them here would show "the inventory could not be loaded" for a load
            that was never attempted.
          */
          canSuspend={access.suspend && lifecycleAction !== "reactivate"}
          inventory={lifecycleInventory}
          inventoryLoading={lifecycleLoading}
          successors={lifecycleSuccessors}
          onOpenChange={closeLifecycle}
          onSubmit={submitLifecycle}
        />
      ) : null}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                const pending = confirm;
                setConfirm(null);
                if (pending) void runWrite(pending.run);
              }}
            >
              {confirm?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
