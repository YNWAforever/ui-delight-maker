import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminError } from "@/lib/admin/errors";
import { adminPeopleSearchSchema, type AdminPeopleSearch } from "@/lib/admin/schemas";
import { PeopleDirectory } from "@/components/admin/people-directory";
import { UserDetailPanel } from "@/components/admin/user-detail-panel";
import { InviteUsersDialog } from "@/components/admin/invite-users-dialog";
import {
  UserLifecycleDialog,
  type UserLifecycleSubmit,
} from "@/components/admin/user-lifecycle-dialog";
import { UserRoleDialog } from "@/components/admin/user-role-dialog";
import type { LifecycleSuccessorOption } from "@/components/admin/work-reassignment-table";
import type { ReassignmentInventory } from "@/server/admin/reassignment.server";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import {
  changeAdminUserRoleFn,
  deactivateAdminUserWithReassignmentFn,
  getAdminReassignmentInventoryFn,
  getAdminUserFn,
  getAdminUsersFn,
  suspendAdminUserFn,
} from "@/server-functions/admin-users";
import { inviteUsers } from "@/server-functions/admin-invitations";

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

export const Route = createFileRoute("/admin/people")({
  validateSearch: adminPeopleSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, deps: { search } }) => {
    const directoryPromise = context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.admin.list({ resource: "people", ...toUserFilters(search) }),
        queryFn: () => getAdminUsersFn({ data: toUserFilters(search) }),
      }),
    );
    const selectedUserPromise = search.user
      ? context.queryClient
          .ensureQueryData(
            routeQueryOptions({
              queryKey: crmQueryKeys.admin.detail(search.user),
              queryFn: () => getAdminUserFn({ data: { profileId: search.user! } }),
            }),
          )
          .catch((error) => {
            if (
              error instanceof AdminError &&
              ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)
            ) {
              return null;
            }
            throw error;
          })
      : Promise.resolve(null);

    try {
      const [directory, selectedUser] = await Promise.all([directoryPromise, selectedUserPromise]);
      return { directory, selectedUser, forbidden: false };
    } catch (error) {
      if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
        return { directory: undefined, selectedUser: null, forbidden: true };
      }
      throw error;
    }
  },
  head: () => ({ meta: [{ title: "People · Admin · Fimmick ClientOps" }] }),
  component: AdminPeopleRoute,
});

function AdminPeopleRoute() {
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const { data: directory } = useQuery({
    ...peopleDirectoryQuery(search),
    initialData: loaderData.directory,
    enabled: !loaderData.forbidden,
  });
  const { data: selectedUserData } = useQuery({
    ...adminUserQuery(search.user ?? "unselected"),
    initialData: loaderData.selectedUser ?? undefined,
    enabled: !loaderData.forbidden && Boolean(search.user),
  });
  const selectedUser = selectedUserData ?? null;
  const forbidden = loaderData.forbidden;
  const { profile } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const lifecycleRequest = useRef(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleUser, setRoleUser] = useState(selectedUser);
  const [lifecycleUser, setLifecycleUser] = useState(selectedUser);
  const [lifecycleInventory, setLifecycleInventory] = useState<ReassignmentInventory>();
  const [lifecycleSuccessors, setLifecycleSuccessors] = useState<LifecycleSuccessorOption[]>([]);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);

  const updateSearch = (next: AdminPeopleSearch) => navigate({ search: () => next, replace: true });
  const canInvite = ["super_admin", "admin", "manager"].includes(profile?.role ?? "");
  const canManageLifecycle = ["super_admin", "admin"].includes(profile?.role ?? "");

  const refreshPeople = async (profileId?: string, includeShell = false) => {
    const refreshes = [queryClient.invalidateQueries({ queryKey: crmQueryKeys.admin.lists() })];
    if (profileId) {
      refreshes.push(
        queryClient.invalidateQueries({
          queryKey: crmQueryKeys.admin.detail(profileId),
          exact: true,
        }),
      );
    }
    if (includeShell) {
      refreshes.push(
        queryClient.invalidateQueries({ queryKey: crmQueryKeys.shell(), exact: true }),
      );
    }
    await Promise.all(refreshes);
  };

  const openLifecycle = async () => {
    if (!selectedUser) return;
    const requestNumber = ++lifecycleRequest.current;
    setLifecycleUser(selectedUser);
    setLifecycleInventory(undefined);
    setLifecycleSuccessors([]);
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
      toast.error(
        error instanceof AdminError || error instanceof Error
          ? error.message
          : "Could not load this user's ownership inventory.",
      );
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

  const submitLifecycle = async (input: UserLifecycleSubmit) => {
    if (input.action === "suspend") {
      await suspendAdminUserFn({
        data: { profileId: input.profileId, reason: input.reason },
      });
      toast.success("User suspended");
    } else {
      await deactivateAdminUserWithReassignmentFn({
        data: {
          profileId: input.profileId,
          reason: input.reason,
          reviewedInventory: input.reviewedInventory,
          successors: input.successors,
        },
      });
      toast.success("User deactivated");
    }
    closeLifecycle(false);
    await refreshPeople(input.profileId);
  };

  if (forbidden) {
    return (
      <div
        role="alert"
        className="m-6 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-5 text-sm text-destructive"
      >
        People administration is outside your access scope.
      </div>
    );
  }

  return (
    <>
      <div className="grid min-w-0 md:grid-cols-[minmax(0,1fr)_20rem]">
        <PeopleDirectory
          data={directory}
          search={search}
          selectedUserId={search.user}
          onSearchChange={updateSearch}
          onSelectUser={(profileId) => updateSearch({ ...search, user: profileId })}
          canInvite={canInvite}
          onInvite={() => setInviteOpen(true)}
        />
        <div className="hidden md:block">
          <UserDetailPanel
            user={selectedUser}
            fullHref={selectedUser ? "/admin/people/" + selectedUser.id : undefined}
            onRoleChange={selectedUser ? () => setRoleUser(selectedUser) : undefined}
            onLifecycle={
              canManageLifecycle && selectedUser && selectedUser.status !== "deactivated"
                ? openLifecycle
                : undefined
            }
          />
        </div>
      </div>

      <InviteUsersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSubmit={async (invitations) => {
          const result = await inviteUsers({ data: { invitations } });
          toast.success("Invitation batch processed");
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
          inventory={lifecycleLoading ? undefined : lifecycleInventory}
          successors={lifecycleSuccessors}
          onOpenChange={closeLifecycle}
          onSubmit={submitLifecycle}
        />
      ) : null}
    </>
  );
}
