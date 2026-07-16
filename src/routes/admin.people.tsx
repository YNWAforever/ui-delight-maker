import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminError } from "@/lib/admin/errors";
import { adminPeopleSearchSchema, type AdminPeopleSearch } from "@/lib/admin/schemas";
import { PeopleDirectory } from "@/components/admin/people-directory";
import { UserDetailPanel } from "@/components/admin/user-detail-panel";
import { InviteUsersDialog } from "@/components/admin/invite-users-dialog";
import { UserRoleDialog } from "@/components/admin/user-role-dialog";
import {
  getAdminUserFn,
  getAdminUsersFn,
  changeAdminUserRoleFn,
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

export const Route = createFileRoute("/admin/people")({
  validateSearch: adminPeopleSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps: { search } }) => {
    try {
      const directory = await getAdminUsersFn({ data: toUserFilters(search) });
      let selectedUser = null;
      if (search.user) {
        try {
          selectedUser = await getAdminUserFn({ data: { profileId: search.user } });
        } catch (error) {
          if (
            !(error instanceof AdminError) ||
            !["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)
          ) {
            throw error;
          }
        }
      }
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
  const { directory, selectedUser, forbidden } = Route.useLoaderData();
  const { profile } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleUser, setRoleUser] = useState(selectedUser);

  const updateSearch = (next: AdminPeopleSearch) => navigate({ search: () => next, replace: true });
  const canInvite = ["super_admin", "admin", "manager"].includes(profile?.role ?? "");

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
          />
        </div>
      </div>

      <InviteUsersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSubmit={async (invitations) => {
          const result = await inviteUsers({ data: { invitations } });
          toast.success("Invitation batch processed");
          await router.invalidate();
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
          await router.invalidate();
        }}
      />
    </>
  );
}
