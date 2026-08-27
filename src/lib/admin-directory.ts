import { AdminError } from "@/lib/admin/errors";
import { crmQueryKeys } from "@/lib/query-keys";
import type { TeamMemberUser } from "@/components/admin/team-member-table";
import { getAdminOrganizationFn } from "@/server-functions/admin-teams";
import { getAdminUsersFn } from "@/server-functions/admin-users";
import type { OrganizationDirectory } from "@/server/repositories/admin-teams";

/**
 * The two reads every admin screen needs to turn an id into a name.
 *
 * They were declared four times — once each in `admin.teams.tsx`, `admin.teams.$id.tsx` and
 * (partially) `admin.access.tsx` — with the query keys spelled out by hand in each. That is
 * how `/admin/people` ended up invalidating a key `/admin/teams` reads under a different
 * spelling, and how `/admin/people` came to render "Department ID (optional)" as a free-text
 * box asking for a raw UUID while the directory that names every department was already
 * loaded two routes away under a key nobody shared.
 *
 * Keeping the keys here means a write on any admin screen can refresh what every other admin
 * screen reads, without four files having to agree by inspection.
 */

/** Departments and teams, with their memberships. Shared by teams, people and access. */
export const adminOrganizationQueryKey = crmQueryKeys.admin.section("organization", "directory");

/** One department or team with its detail. */
export const adminOrganizationUnitQueryKey = (kind: "department" | "team", id: string) =>
  crmQueryKeys.admin.section(`${kind}:${id}`, "organization-unit");

/**
 * Active profiles, used as options wherever a person has to be picked.
 *
 * With a `profileId` it is that person's detail key instead, which is what the team screens
 * invalidate after a membership change.
 */
export const adminPeopleOptionsQueryKey = (profileId?: string) =>
  profileId
    ? crmQueryKeys.admin.detail(profileId)
    : crmQueryKeys.admin.section("people", "team-member-options");

/**
 * Active profiles as picker options.
 *
 * A denial returns an empty list rather than throwing: a manager may hold `teams.view`
 * without `users.view`, and losing the *names* on a team screen is a degraded label, not a
 * reason to fail the page. Anything that is not a capability denial still throws, because a
 * driver failure hidden behind an empty picker looks like "there is nobody to choose".
 */
export async function loadActiveProfiles(): Promise<TeamMemberUser[]> {
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

/** The organization directory, degrading to empty for an actor without `teams.view`. */
export async function loadOrganizationDirectory(): Promise<OrganizationDirectory> {
  try {
    return await getAdminOrganizationFn();
  } catch (error) {
    if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
      return { departments: [], teams: [], memberships: [] };
    }
    throw error;
  }
}

export type UnitOption = { id: string; name: string };

/** Active departments as picker options, sorted by name so two screens list them the same. */
export function departmentOptions(directory: OrganizationDirectory | undefined): UnitOption[] {
  return (directory?.departments ?? [])
    .filter((department) => department.status === "active")
    .map((department) => ({ id: department.id, name: department.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Active teams as picker options. */
export function teamOptions(directory: OrganizationDirectory | undefined): UnitOption[] {
  return (directory?.teams ?? [])
    .filter((team) => team.status === "active")
    .map((team) => ({ id: team.id, name: team.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
