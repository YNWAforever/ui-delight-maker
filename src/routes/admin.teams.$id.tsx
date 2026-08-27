import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { OrganizationUnitDetail } from "@/components/admin/organization-unit-detail";
import {
  OrganizationUnitDialog,
  type OrganizationUnitKind,
  type OrganizationUnitSubmit,
} from "@/components/admin/organization-unit-dialog";
import type { TeamMemberRow } from "@/components/admin/team-member-table";
import { EmptyWorkspaceState, ErrorState, WorkspaceHeader } from "@/components/sales";
import { adminControlAccess } from "@/lib/admin-capabilities";
import {
  adminOrganizationQueryKey,
  adminOrganizationUnitQueryKey,
  adminPeopleOptionsQueryKey,
  loadActiveProfiles,
} from "@/lib/admin-directory";
import { refreshAdminCapabilityScope } from "@/lib/admin-invalidation";
import { AdminError } from "@/lib/admin/errors";
import { adminOrganizationSearchSchema } from "@/lib/admin/schemas";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
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

const OTHER_KIND = { department: "team", team: "department" } as const;

/**
 * Resolve a unit by id, trying the kind in the URL first and then the other one.
 *
 * `adminOrganizationSearchSchema.kind` defaults to `"department"`, and this route's only
 * inbound links now carry the right kind — but a shared or hand-typed
 * `/admin/teams/<team-id>` still arrives without one, and the old loader answered it by
 * asking for a *department* with a team's id and rendering "not found". A record that exists
 * and reports that it does not is worse than a slow second lookup.
 *
 * Both lookups swallow only capability denials and conflicts; anything else still throws to
 * the route's error boundary rather than being flattened into "not found".
 */
async function loadUnitByAnyKind(preferred: "department" | "team", id: string) {
  const first = await tryLoadUnit(preferred, id);
  if (first) return first;
  return tryLoadUnit(OTHER_KIND[preferred], id);
}

async function tryLoadUnit(kind: "department" | "team", id: string) {
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

/**
 * Keyed on `params.id`, which is the fix for the cache bug this route shipped with.
 *
 * The component used to key the query off `loaded.detail?.unit.id ?? "missing"` while the
 * loader keyed it off `params.id`, so a unit that failed to load cached under
 * `"department:missing"` — one shared slot for every unloadable unit.
 */
const unitQueryOptions = (kind: "department" | "team", id: string) =>
  routeQueryOptions({
    queryKey: adminOrganizationUnitQueryKey(kind, id),
    queryFn: () => loadUnitByAnyKind(kind, id),
  });

const profilesQueryOptions = () =>
  routeQueryOptions({ queryKey: adminPeopleOptionsQueryKey(), queryFn: loadActiveProfiles });

export const Route = createFileRoute("/admin/teams/$id")({
  validateSearch: adminOrganizationSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, params, deps }) => {
    const [detail, users] = await Promise.all([
      context.queryClient.ensureQueryData(unitQueryOptions(deps.search.kind, params.id)),
      context.queryClient.ensureQueryData(profilesQueryOptions()),
    ]);
    return { detail, users };
  },
  head: () => ({ meta: [{ title: "Organization unit · Admin · Fimmick ClientOps" }] }),
  errorComponent: AdminTeamDetailErrorState,
  component: AdminTeamDetailRoute,
});

/**
 * This route was the only one in the slice with no `AdminError` catch anywhere, so a
 * FORBIDDEN escaped to the root boundary, which renders `{error.message}` into the page body.
 */
function AdminTeamDetailErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="This organization unit did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/admin/teams/$id" });
        }}
      />
    </div>
  );
}

function AdminTeamDetailRoute() {
  const search = Route.useSearch();
  const params = Route.useParams();
  const loaded = Route.useLoaderData();
  const { profile } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const queryClient = useQueryClient();
  const writeLock = useRef(false);

  const detailQueryResult = useQuery({
    ...unitQueryOptions(search.kind, params.id),
    initialData: loaded.detail,
    placeholderData: (previous) => previous,
  });
  const usersQueryResult = useQuery({
    ...profilesQueryOptions(),
    initialData: loaded.users,
    placeholderData: (previous) => previous,
  });
  const detail = detailQueryResult.data;
  const users = usersQueryResult.data;
  const [dialog, setDialog] = useState<{
    kind: OrganizationUnitKind;
    unit: Department | Team | null;
  } | null>(null);

  const access = adminControlAccess(profile?.role);
  const canManage = detail?.kind === "department" ? access.manageDepartment : access.manageTeam;

  const refreshOrganization = async (
    kind: "department" | "team",
    id: string,
    profileIds: string[] = [],
    capabilityAffecting = false,
  ) => {
    const exactKeys = [
      adminOrganizationQueryKey,
      adminOrganizationUnitQueryKey(kind, id),
      // The unit is also cached under the kind in this URL, which is not always the kind the
      // record turned out to be.
      adminOrganizationUnitQueryKey(search.kind, params.id),
      adminPeopleOptionsQueryKey(),
      crmQueryKeys.admin.section("overview", "summary"),
      ...profileIds.map((profileId) => adminPeopleOptionsQueryKey(profileId)),
      ...(capabilityAffecting ? [crmQueryKeys.shell()] : []),
    ];
    await Promise.all([
      ...exactKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey, exact: true })),
      // Prefix, not exact: `listAdminUsers` selects a live `team_count`, so every cached page
      // of `/admin/people` is stale after a membership change.
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.admin.lists() }),
    ]);
    if (capabilityAffecting) await refreshAdminCapabilityScope(router);
  };

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
    if (!value.id) return;
    if (value.kind === "department") {
      await updateDepartmentFn({ data: { id: value.id, input: value.input as DepartmentInput } });
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
    await runWrite(async () => {
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
      toast.success(
        profileIds.length === 1
          ? "Member added"
          : `${formatCount(profileIds.length)} members added`,
      );
      await refreshOrganization("team", detail.unit.id, profileIds, true);
    });
  }

  // Both of these used to be byte-identical to the `/admin/teams` copies except that their
  // success toasts had been dropped — two screens, the same action, different feedback.
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

  if (!detail) {
    return (
      <>
        <WorkspaceHeader
          context="Administration"
          title="Organization unit"
          backHref={{ to: "/admin/teams", label: "Back to the organization directory" }}
        />
        <div className="px-4 py-6 md:px-6">
          <EmptyWorkspaceState
            title="That organization unit is not available"
            description="It may have been archived, or it may sit outside your management scope."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <WorkspaceHeader
        context="Administration"
        title={detail.unit.name}
        description={
          detail.kind === "department"
            ? "Department reporting line and its working teams."
            : "Working team membership, with history preserved on every change."
        }
        backHref={{ to: "/admin/teams", label: "Back to the organization directory" }}
      />
      <OrganizationUnitDetail
        detail={detail}
        users={users}
        activeTab={search.tab}
        canManage={canManage}
        onTabChange={(tab) =>
          navigate({ search: (current) => ({ ...current, tab }), replace: true })
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
