import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminError } from "@/lib/admin/errors";
import { adminOrganizationSearchSchema, type AdminOrganizationSearch } from "@/lib/admin/schemas";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { OrganizationDirectory } from "@/components/admin/organization-directory";
import { OrganizationUnitDetail } from "@/components/admin/organization-unit-detail";
import {
  OrganizationUnitDialog,
  type OrganizationUnitKind,
  type OrganizationUnitSubmit,
} from "@/components/admin/organization-unit-dialog";
import type { TeamMemberRow, TeamMemberUser } from "@/components/admin/team-member-table";
import type {
  Department,
  DepartmentInput,
  OrganizationUnitDetail as OrganizationUnitDetailData,
  Team,
  TeamInput,
} from "@/server/repositories/admin-teams";
import {
  createDepartmentFn,
  createTeamFn,
  endAdminTeamMembershipFn,
  getAdminOrganizationFn,
  getAdminOrganizationUnitFn,
  updateDepartmentFn,
  updateTeamFn,
  upsertAdminTeamMembershipFn,
} from "@/server-functions/admin-teams";
import { getAdminUsersFn } from "@/server-functions/admin-users";

const adminOrganizationQueryKey = crmQueryKeys.admin.section("organization", "directory");
const adminTeamQueryKey = (kind: "department" | "team", id: string) =>
  crmQueryKeys.admin.section(`${kind}:${id}`, "organization-unit");
const adminPeopleQueryKey = (profileId?: string) =>
  profileId
    ? crmQueryKeys.admin.detail(profileId)
    : crmQueryKeys.admin.section("people", "team-member-options");

async function loadUsers(): Promise<TeamMemberUser[]> {
  try {
    const result = await getAdminUsersFn({ data: { status: "active", page: 1, limit: 100 } });
    return result.items.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
    }));
  } catch (error) {
    if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
      return [];
    }
    throw error;
  }
}

async function loadUnit(kind: "department" | "team", id: string) {
  try {
    return await getAdminOrganizationUnitFn({ data: { kind, id } });
  } catch (error) {
    if (
      error instanceof AdminError &&
      ["FORBIDDEN", "OUTSIDE_SCOPE", "CONFLICT"].includes(error.code)
    ) {
      return null;
    }
    throw error;
  }
}

export const Route = createFileRoute("/admin/teams")({
  validateSearch: adminOrganizationSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, deps: { search } }) => {
    const [directory, users, selectedUnit] = await Promise.all([
      context.queryClient.ensureQueryData(
        routeQueryOptions({
          queryKey: adminOrganizationQueryKey,
          queryFn: () => getAdminOrganizationFn(),
        }),
      ),
      context.queryClient.ensureQueryData(
        routeQueryOptions({
          queryKey: adminPeopleQueryKey(),
          queryFn: async () => {
            // Keep the permitted people read concurrent with the organization directory.
            await Promise.resolve(getAdminUsersFn);
            return loadUsers();
          },
        }),
      ),
      search.unit
        ? context.queryClient.ensureQueryData(
            routeQueryOptions({
              queryKey: adminTeamQueryKey(search.kind, search.unit),
              queryFn: () =>
                getAdminOrganizationUnitFn({
                  data: { kind: search.kind, id: search.unit! },
                }).catch((error) => {
                  if (
                    error instanceof AdminError &&
                    ["FORBIDDEN", "OUTSIDE_SCOPE", "CONFLICT"].includes(error.code)
                  ) {
                    return null;
                  }
                  throw error;
                }),
            }),
          )
        : Promise.resolve(null),
    ]);
    return { directory, users, selectedUnit };
  },
  head: () => ({ meta: [{ title: "Organization - Admin - Fimmick ClientOps" }] }),
  component: AdminTeamsRoute,
});

function AdminTeamsRoute() {
  const search = Route.useSearch();
  const loaded = Route.useLoaderData();
  const { profile } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const directoryQuery = useQuery({
    ...routeQueryOptions({
      queryKey: adminOrganizationQueryKey,
      queryFn: () => getAdminOrganizationFn(),
    }),
    initialData: loaded.directory,
    placeholderData: (previous) => previous,
  });
  const usersQuery = useQuery({
    ...routeQueryOptions({ queryKey: adminPeopleQueryKey(), queryFn: loadUsers }),
    initialData: loaded.users,
    placeholderData: (previous) => previous,
  });
  const selectedUnitQuery = useQuery({
    ...routeQueryOptions({
      queryKey: adminTeamQueryKey(search.kind, search.unit ?? "none"),
      queryFn: () => (search.unit ? loadUnit(search.kind, search.unit) : Promise.resolve(null)),
    }),
    initialData: loaded.selectedUnit,
    placeholderData: (previous) => previous,
    enabled: Boolean(search.unit),
  });
  const directory = directoryQuery.data;
  const users = usersQuery.data;
  const selectedUnit = selectedUnitQuery.data;
  const [dialog, setDialog] = useState<{
    kind: OrganizationUnitKind;
    unit: Department | Team | null;
  } | null>(null);

  const actorRole = profile?.role ?? "read_only";
  const canManageDepartment = ["super_admin", "admin"].includes(actorRole);
  const canManageTeam = ["super_admin", "admin", "manager"].includes(actorRole);
  const canManageSelected = selectedUnit
    ? selectedUnit.kind === "department"
      ? canManageDepartment
      : canManageTeam
    : false;

  const updateSearch = (next: AdminOrganizationSearch) =>
    navigate({ search: () => next, replace: true });

  const refreshOrganization = async (
    kind: "department" | "team",
    id: string,
    profileIds: string[] = [],
    includeShell = false,
  ) => {
    const keys = [
      adminOrganizationQueryKey,
      adminTeamQueryKey(kind, id),
      adminPeopleQueryKey(),
      ...profileIds.map((profileId) => adminPeopleQueryKey(profileId)),
      ...(includeShell ? [crmQueryKeys.shell()] : []),
    ];
    await Promise.all(
      keys.map((queryKey) => queryClient.invalidateQueries({ queryKey, exact: true })),
    );
  };

  async function saveUnit(value: OrganizationUnitSubmit) {
    let saved: Department | Team;
    if (value.kind === "department") {
      const input = value.input as DepartmentInput;
      saved = value.id
        ? await updateDepartmentFn({ data: { id: value.id, input } })
        : await createDepartmentFn({ data: input });
    } else {
      const input = value.input as TeamInput;
      saved = value.id
        ? await updateTeamFn({ data: { id: value.id, input } })
        : await createTeamFn({ data: input });
    }
    toast.success(value.id ? "Organization unit updated" : "Organization unit created");
    setDialog(null);
    const profileIds = (
      value.kind === "department"
        ? [
            (value.input as DepartmentInput).headProfileId,
            (value.input as DepartmentInput).deputyProfileId,
          ]
        : [
            (value.input as TeamInput).leadProfileId,
            (value.input as TeamInput).deputyProfileId,
            (value.input as TeamInput).defaultOwnerProfileId,
          ]
    ).filter((profileId): profileId is string => Boolean(profileId));
    await refreshOrganization(value.kind, value.id ?? saved.id, profileIds, true);
  }

  async function addMembers(profileIds: string[], startsAt: string | null, endsAt: string | null) {
    if (!selectedUnit || selectedUnit.kind !== "team") return;
    await Promise.all(
      profileIds.map((profileId) =>
        upsertAdminTeamMembershipFn({
          data: {
            teamId: selectedUnit.unit.id,
            profileId,
            membershipRole: "member",
            ...(startsAt ? { startsAt } : {}),
            ...(endsAt ? { endsAt } : {}),
          },
        }),
      ),
    );
    toast.success(profileIds.length === 1 ? "Member added" : profileIds.length + " members added");
    await refreshOrganization("team", selectedUnit.unit.id, profileIds, true);
  }

  async function updateMember(member: TeamMemberRow, role: "lead" | "deputy" | "member") {
    await upsertAdminTeamMembershipFn({
      data: {
        teamId: member.teamId,
        profileId: member.profileId,
        membershipRole: role,
        ...(member.startsAt ? { startsAt: member.startsAt } : {}),
        ...(member.endsAt ? { endsAt: member.endsAt } : {}),
      },
    });
    toast.success("Membership role updated");
    await refreshOrganization("team", member.teamId, [member.profileId], true);
  }

  async function endMember(member: TeamMemberRow) {
    await endAdminTeamMembershipFn({
      data: {
        teamId: member.teamId,
        profileId: member.profileId,
        endedAt: new Date().toISOString(),
      },
    });
    toast.success("Membership ended");
    await refreshOrganization("team", member.teamId, [member.profileId], true);
  }

  function createUnit(kind: "department" | "team") {
    if (kind === "department" && !canManageDepartment) {
      toast.error("Department management is outside your access scope.");
      return;
    }
    if (kind === "team" && !canManageTeam) {
      toast.error("Team management is outside your access scope.");
      return;
    }
    setDialog({ kind, unit: null });
  }

  return (
    <>
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <OrganizationDirectory
          data={directory}
          search={search}
          selectedUnitId={search.unit}
          onSearchChange={updateSearch}
          onSelectUnit={(unit) =>
            updateSearch({ ...search, kind: unit.kind, unit: unit.id, tab: "overview" })
          }
          onCreate={createUnit}
        />
        <OrganizationUnitDetail
          detail={selectedUnit}
          users={users}
          activeTab={search.tab}
          canManage={canManageSelected}
          onTabChange={(tab) => updateSearch({ ...search, tab })}
          onEdit={(unit) => setDialog({ kind: selectedUnit?.kind ?? "team", unit })}
          onAddMembers={canManageSelected ? addMembers : undefined}
          onUpdateMember={canManageSelected ? updateMember : undefined}
          onEndMember={canManageSelected ? endMember : undefined}
        />
      </div>

      {dialog ? (
        <OrganizationUnitDialog
          open
          kind={dialog.kind}
          unit={dialog.unit}
          users={users}
          openOwnedWorkCount={selectedUnit?.openOwnedWorkCount ?? 0}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          onSubmit={saveUnit}
        />
      ) : null}
    </>
  );
}
