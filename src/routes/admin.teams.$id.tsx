import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminError } from "@/lib/admin/errors";
import { adminOrganizationSearchSchema } from "@/lib/admin/schemas";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
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
  Team,
  TeamInput,
} from "@/server/repositories/admin-teams";
import {
  endAdminTeamMembershipFn,
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

const detailQuery = (kind: "department" | "team", id: string) =>
  routeQueryOptions({
    queryKey: adminTeamQueryKey(kind, id),
    queryFn: () => getAdminOrganizationUnitFn({ data: { kind, id } }),
  });

const usersQuery = () => routeQueryOptions({ queryKey: adminPeopleQueryKey(), queryFn: loadUsers });

export const Route = createFileRoute("/admin/teams/$id")({
  validateSearch: adminOrganizationSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, params, deps }) => {
    const [detail, users] = await Promise.all([
      context.queryClient.ensureQueryData(detailQuery(deps.search.kind, params.id)),
      context.queryClient.ensureQueryData(usersQuery()),
    ]);
    return { detail, users };
  },
  head: () => ({ meta: [{ title: "Organization unit - Admin - Fimmick ClientOps" }] }),
  component: AdminTeamDetailRoute,
});

function AdminTeamDetailRoute() {
  const search = Route.useSearch();
  const loaded = Route.useLoaderData();
  const { profile } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const detailQueryResult = useQuery({
    ...detailQuery(search.kind, loaded.detail?.unit.id ?? "missing"),
    initialData: loaded.detail,
    placeholderData: (previous) => previous,
  });
  const usersQueryResult = useQuery({
    ...usersQuery(),
    initialData: loaded.users,
    placeholderData: (previous) => previous,
  });
  const detail = detailQueryResult.data;
  const users = usersQueryResult.data;
  const [dialog, setDialog] = useState<{
    kind: OrganizationUnitKind;
    unit: Department | Team | null;
  } | null>(null);

  const actorRole = profile?.role ?? "read_only";
  const canManage =
    detail?.kind === "department"
      ? ["super_admin", "admin"].includes(actorRole)
      : ["super_admin", "admin", "manager"].includes(actorRole);

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
    if (!value.id) return;
    if (value.kind === "department") {
      await updateDepartmentFn({
        data: { id: value.id, input: value.input as DepartmentInput },
      });
    } else {
      await updateTeamFn({ data: { id: value.id, input: value.input as TeamInput } });
    }
    toast.success("Organization unit updated");
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
    await refreshOrganization(value.kind, value.id, profileIds, true);
  }

  async function addMembers(profileIds: string[], startsAt: string | null, endsAt: string | null) {
    if (!detail || detail.kind !== "team") return;
    await Promise.all(
      profileIds.map((profileId) =>
        upsertAdminTeamMembershipFn({
          data: {
            teamId: detail.unit.id,
            profileId,
            membershipRole: "member",
            ...(startsAt ? { startsAt } : {}),
            ...(endsAt ? { endsAt } : {}),
          },
        }),
      ),
    );
    toast.success(profileIds.length + " members added");
    await refreshOrganization("team", detail.unit.id, profileIds, true);
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
    await refreshOrganization("team", member.teamId, [member.profileId], true);
  }

  if (!detail) {
    return (
      <div className="m-6 rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Organization unit not found.
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-border px-4 py-5 md:px-6">
        <Link
          to="/admin/teams"
          search={{
            kind: detail.kind,
            tab: search.tab,
            status: search.status,
            q: search.q,
            unit: detail.unit.id,
          }}
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to organization
        </Link>
      </div>
      <OrganizationUnitDetail
        detail={detail}
        users={users}
        activeTab={search.tab}
        canManage={canManage}
        onTabChange={(tab) =>
          navigate({
            search: (current) => ({ ...current, tab }),
            replace: true,
          })
        }
        onEdit={(unit) => setDialog({ kind: detail.kind, unit })}
        onAddMembers={canManage ? addMembers : undefined}
        onUpdateMember={canManage ? updateMember : undefined}
        onEndMember={canManage ? endMember : undefined}
      />
      {dialog ? (
        <OrganizationUnitDialog
          open
          kind={dialog.kind}
          unit={dialog.unit}
          users={users}
          openOwnedWorkCount={detail.openOwnedWorkCount}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          onSubmit={saveUnit}
        />
      ) : null}
    </>
  );
}
