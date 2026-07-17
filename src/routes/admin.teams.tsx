import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminError } from "@/lib/admin/errors";
import { adminOrganizationSearchSchema, type AdminOrganizationSearch } from "@/lib/admin/schemas";
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

export const Route = createFileRoute("/admin/teams")({
  validateSearch: adminOrganizationSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps: { search } }) => {
    const directory = await getAdminOrganizationFn();
    const users = await loadUsers();
    let selectedUnit: OrganizationUnitDetailData | null = null;
    if (search.unit) {
      try {
        selectedUnit = await getAdminOrganizationUnitFn({
          data: { kind: search.kind, id: search.unit },
        });
      } catch (error) {
        if (
          !(error instanceof AdminError) ||
          !["FORBIDDEN", "OUTSIDE_SCOPE", "CONFLICT"].includes(error.code)
        ) {
          throw error;
        }
      }
    }
    return { directory, users, selectedUnit };
  },
  head: () => ({ meta: [{ title: "Organization - Admin - Fimmick ClientOps" }] }),
  component: AdminTeamsRoute,
});

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

function AdminTeamsRoute() {
  const search = Route.useSearch();
  const { directory, users, selectedUnit } = Route.useLoaderData();
  const { profile } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
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

  async function saveUnit(value: OrganizationUnitSubmit) {
    if (value.kind === "department") {
      const input = value.input as DepartmentInput;
      if (value.id) {
        await updateDepartmentFn({ data: { id: value.id, input } });
      } else {
        await createDepartmentFn({ data: input });
      }
    } else {
      const input = value.input as TeamInput;
      if (value.id) {
        await updateTeamFn({ data: { id: value.id, input } });
      } else {
        await createTeamFn({ data: input });
      }
    }
    toast.success(value.id ? "Organization unit updated" : "Organization unit created");
    setDialog(null);
    await router.invalidate();
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
    await router.invalidate();
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
    await router.invalidate();
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
    await router.invalidate();
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
