import { useRef, useState } from "react";
import { Outlet, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { OrganizationDirectory } from "@/components/admin/organization-directory";
import { OrganizationUnitDetail } from "@/components/admin/organization-unit-detail";
import {
  OrganizationUnitDialog,
  type OrganizationUnitKind,
  type OrganizationUnitSubmit,
} from "@/components/admin/organization-unit-dialog";
import type { TeamMemberRow } from "@/components/admin/team-member-table";
import { ErrorState, StaleDataIndicator, WorkspaceHeader } from "@/components/sales";
import { Button } from "@/components/ui/button";
import { adminControlAccess } from "@/lib/admin-capabilities";
import {
  adminOrganizationQueryKey,
  adminOrganizationUnitQueryKey,
  adminPeopleOptionsQueryKey,
  loadActiveProfiles,
  loadOrganizationDirectory,
} from "@/lib/admin-directory";
import { refreshAdminCapabilityScope } from "@/lib/admin-invalidation";
import { AdminError } from "@/lib/admin/errors";
import { adminOrganizationSearchSchema, type AdminOrganizationSearch } from "@/lib/admin/schemas";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { useIsExactPath } from "@/lib/routing-utils";
import type {
  Department,
  DepartmentInput,
  Team,
  TeamInput,
} from "@/server/repositories/admin-teams";
import {
  createDepartmentFn,
  createTeamFn,
  endAdminTeamMembershipFn,
  getAdminOrganizationUnitFn,
  updateDepartmentFn,
  updateTeamFn,
  upsertAdminTeamMembershipFn,
} from "@/server-functions/admin-teams";

/**
 * A unit read that degrades on a capability denial or a conflict.
 *
 * Shared by the loader and the query so both agree on what "not visible to you" looks like:
 * `null`, rendered as the empty selection panel, rather than an error boundary.
 */
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

const directoryQueryOptions = () =>
  routeQueryOptions({ queryKey: adminOrganizationQueryKey, queryFn: loadOrganizationDirectory });

const profilesQueryOptions = () =>
  routeQueryOptions({ queryKey: adminPeopleOptionsQueryKey(), queryFn: loadActiveProfiles });

const unitQueryOptions = (kind: "department" | "team", id: string) =>
  routeQueryOptions({
    queryKey: adminOrganizationUnitQueryKey(kind, id),
    queryFn: () => loadUnit(kind, id),
  });

export const Route = createFileRoute("/admin/teams")({
  validateSearch: adminOrganizationSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, deps: { search } }) => {
    const [directory, users, selectedUnit] = await Promise.all([
      context.queryClient.ensureQueryData(directoryQueryOptions()),
      context.queryClient.ensureQueryData(profilesQueryOptions()),
      search.unit
        ? context.queryClient.ensureQueryData(unitQueryOptions(search.kind, search.unit))
        : Promise.resolve(null),
    ]);
    return { directory, users, selectedUnit };
  },
  head: () => ({ meta: [{ title: "Organization · Admin · Fimmick ClientOps" }] }),
  errorComponent: AdminTeamsErrorState,
  component: AdminTeamsRoute,
});

function AdminTeamsErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="The organization directory did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/admin/teams" });
        }}
      />
    </div>
  );
}

/**
 * `/admin/teams/$id` is a child of this route and this component never rendered an `Outlet`.
 *
 * It was worse than the People case: nothing in the product linked to `/admin/teams/$id` at
 * all, so the route was reachable only by typing a URL — and even then it rendered this
 * directory instead, which made its own "Back to organization" link dead too. The inbound
 * link now lives on the unit panel.
 */
function AdminTeamsRoute() {
  const isIndexRoute = useIsExactPath("/admin/teams");
  if (!isIndexRoute) return <Outlet />;
  return <AdminTeamsIndex />;
}

function AdminTeamsIndex() {
  const search = Route.useSearch();
  const loaded = Route.useLoaderData();
  const { profile } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const queryClient = useQueryClient();
  const writeLock = useRef(false);

  const directoryQuery = useQuery({
    ...directoryQueryOptions(),
    initialData: loaded.directory,
    placeholderData: (previous) => previous,
  });
  const usersQuery = useQuery({
    ...profilesQueryOptions(),
    initialData: loaded.users,
    placeholderData: (previous) => previous,
  });
  const selectedUnitQuery = useQuery({
    ...unitQueryOptions(search.kind, search.unit ?? "none"),
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

  const access = adminControlAccess(profile?.role);
  const canManageSelected = selectedUnit
    ? selectedUnit.kind === "department"
      ? access.manageDepartment
      : access.manageTeam
    : false;

  const updateSearch = (next: AdminOrganizationSearch) =>
    navigate({ search: () => next, replace: true });

  /**
   * Everything an organization write can make stale.
   *
   * `crmQueryKeys.admin.lists()` is the addition, and it is a prefix rather than an exact
   * key on purpose: `listAdminUsers` selects a live `team_count` sub-query, so after adding
   * or ending a membership every cached page of `/admin/people` was serving a stale team
   * count. This is the mirror image of the key the people screen was missing.
   */
  const refreshOrganization = async (
    kind: "department" | "team",
    id: string,
    profileIds: string[] = [],
    capabilityAffecting = false,
  ) => {
    const exactKeys = [
      adminOrganizationQueryKey,
      adminOrganizationUnitQueryKey(kind, id),
      adminPeopleOptionsQueryKey(),
      crmQueryKeys.admin.section("overview", "summary"),
      ...profileIds.map((profileId) => adminPeopleOptionsQueryKey(profileId)),
      ...(capabilityAffecting ? [crmQueryKeys.shell()] : []),
    ];
    await Promise.all([
      ...exactKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey, exact: true })),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.admin.lists() }),
    ]);
    if (capabilityAffecting) await refreshAdminCapabilityScope(router);
  };

  /**
   * The single in-flight lock for this screen's writes.
   *
   * None of the six membership handlers had a `catch`, and `TeamMemberTable` called them
   * fire-and-forget — so a refused `upsertAdminTeamMembershipFn` was an unhandled promise
   * rejection with no toast and no visible change, and the reader could not tell a save from
   * a refusal. `runWrite` rethrows after reporting, because `TeamMemberTable` needs the
   * rejection to decide whether to clear its own form.
   */
  const runWrite = async <T,>(work: () => Promise<T>): Promise<T> => {
    if (writeLock.current) throw new Error("Another change is still saving");
    writeLock.current = true;
    try {
      return await work();
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
      throw error;
    } finally {
      writeLock.current = false;
    }
  };

  async function saveUnit(value: OrganizationUnitSubmit) {
    // The dialog owns its own error surface, so this one deliberately does not `runWrite`:
    // the failure belongs beside the fields the user just filled in.
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
    await runWrite(async () => {
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
      toast.success(
        profileIds.length === 1
          ? "Member added"
          : `${formatCount(profileIds.length)} members added`,
      );
      await refreshOrganization("team", selectedUnit.unit.id, profileIds, true);
    });
  }

  async function updateMember(member: TeamMemberRow, role: "lead" | "deputy" | "member") {
    await runWrite(async () => {
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
    });
  }

  async function endMember(member: TeamMemberRow) {
    await runWrite(async () => {
      await endAdminTeamMembershipFn({
        data: {
          teamId: member.teamId,
          profileId: member.profileId,
          endedAt: new Date().toISOString(),
        },
      });
      toast.success("Membership ended");
      await refreshOrganization("team", member.teamId, [member.profileId], true);
    });
  }

  const departmentCount = directory?.departments.length ?? 0;
  const teamCount = directory?.teams.length ?? 0;
  const canCreateCurrentKind =
    search.kind === "department" ? access.manageDepartment : access.manageTeam;

  return (
    <>
      <WorkspaceHeader
        context="Administration"
        title="Departments and teams"
        description={`${formatCount(departmentCount)} departments and ${formatCount(teamCount)} working teams. Reporting lines, working groups and membership history in one place.`}
        status={
          <StaleDataIndicator
            updatedAt={new Date(directoryQuery.dataUpdatedAt).toISOString()}
            isRefetching={directoryQuery.isFetching}
          />
        }
        primaryAction={
          canCreateCurrentKind ? (
            <Button size="sm" onClick={() => setDialog({ kind: search.kind, unit: null })}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              New {search.kind === "department" ? "department" : "team"}
            </Button>
          ) : undefined
        }
      />

      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <OrganizationDirectory
          data={directory}
          search={search}
          selectedUnitId={search.unit}
          canManageDepartment={access.manageDepartment}
          canManageTeam={access.manageTeam}
          onSearchChange={updateSearch}
          onSelectUnit={(unit) =>
            updateSearch({ ...search, kind: unit.kind, unit: unit.id, tab: "overview" })
          }
          onCreate={(kind) => setDialog({ kind, unit: null })}
        />
        <OrganizationUnitDetail
          detail={selectedUnit}
          users={users}
          activeTab={search.tab}
          canManage={canManageSelected}
          showFullRecordLink={Boolean(selectedUnit)}
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
