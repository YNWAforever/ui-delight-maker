import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { teamMembershipSchema } from "@/lib/admin/schemas";
import { requireCapability } from "@/server/auth/authorization.server";
import {
  createDepartment,
  createTeam,
  endTeamMembership,
  getOrganizationUnit,
  listDepartmentsAndTeams,
  updateDepartment,
  updateTeam,
  upsertTeamMembership,
} from "@/server/repositories/admin-teams";

const idSchema = z.string().trim().min(1);
const unitSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  purpose: z.string().trim().nullable().optional(),
  headProfileId: idSchema.nullable().optional(),
  deputyProfileId: idSchema.nullable().optional(),
  leadProfileId: idSchema.nullable().optional(),
  defaultOwnerProfileId: idSchema.nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
});
const updateUnitSchema = z.object({ id: idSchema, input: unitSchema });
const unitDetailSchema = z.object({
  kind: z.enum(["department", "team"]),
  id: idSchema,
});
const endMembershipSchema = z.object({
  teamId: idSchema,
  profileId: idSchema,
  endedAt: z.iso.datetime(),
});

function actorId(session: Awaited<ReturnType<typeof requireCapability>>) {
  return session.profile.id;
}

export const getAdminOrganizationFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireCapability("teams.view");
  return listDepartmentsAndTeams();
});

export const getAdminOrganizationUnitFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => unitDetailSchema.parse(data))
  .handler(async ({ data }) => {
    const input = unitDetailSchema.parse(data);
    await requireCapability("teams.view", {
      ...(input.kind === "team" ? { teamId: input.id } : { departmentId: input.id }),
    });
    return getOrganizationUnit(input.kind, input.id);
  });

export const createDepartmentFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => unitSchema.parse(data))
  .handler(async ({ data }) => {
    const input = unitSchema.parse(data);
    const session = await requireCapability("departments.manage");
    return createDepartment(input, actorId(session));
  });

export const updateDepartmentFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => updateUnitSchema.parse(data))
  .handler(async ({ data }) => {
    const input = updateUnitSchema.parse(data);
    const session = await requireCapability("departments.manage", { departmentId: input.id });
    return updateDepartment(input.id, input.input, actorId(session));
  });

export const createTeamFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => unitSchema.parse(data))
  .handler(async ({ data }) => {
    const input = unitSchema.parse(data);
    const session = await requireCapability("teams.manage");
    return createTeam(input, actorId(session));
  });

export const updateTeamFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => updateUnitSchema.parse(data))
  .handler(async ({ data }) => {
    const input = updateUnitSchema.parse(data);
    const session = await requireCapability("teams.manage", { teamId: input.id });
    return updateTeam(input.id, input.input, actorId(session));
  });

export const upsertAdminTeamMembershipFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => teamMembershipSchema.parse(data))
  .handler(async ({ data }) => {
    const input = teamMembershipSchema.parse(data);
    const session = await requireCapability("teams.manage", {
      teamId: input.teamId,
      profileId: input.profileId,
    });
    return upsertTeamMembership(input, actorId(session));
  });

export const endAdminTeamMembershipFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => endMembershipSchema.parse(data))
  .handler(async ({ data }) => {
    const input = endMembershipSchema.parse(data);
    const session = await requireCapability("teams.manage", {
      teamId: input.teamId,
      profileId: input.profileId,
    });
    return endTeamMembership(input.teamId, input.profileId, input.endedAt, actorId(session));
  });
