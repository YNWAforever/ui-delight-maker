import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseOperationInput } from "@/lib/operations/errors";
import { loadRequestAuthorization, requireCapability } from "@/server/auth/authorization.server";
import {
  listAssignableProfiles,
  resolveAssignableProfile,
  type ProfilePurpose,
} from "@/server/repositories/assignable-profiles";

const PurposeSchema = z.enum([
  "task_filter",
  "task_assign",
  "lead_assign",
  "approval_reviewer",
  "job_sheet_owner",
  "job_sheet_owner_filter",
  "admin_access",
  "admin_directory",
  "successor",
]);
const ResolveSchema = z.strictObject({
  purpose: PurposeSchema,
  id: z.string().trim().min(1).max(255),
  resourceId: z.string().trim().min(1).max(255).optional(),
});
const SearchSchema = z.strictObject({
  purpose: PurposeSchema,
  query: z.string().trim().max(200).optional(),
  cursor: z.string().max(2048).optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  resourceId: z.string().trim().min(1).max(255).optional(),
});

async function requirePurpose(
  purpose: ProfilePurpose,
  context: Awaited<ReturnType<typeof loadRequestAuthorization>>,
  resourceId?: string,
) {
  if (purpose === "task_assign") {
    await requireCapability("tasks.update", {}, context);
    return;
  }
  const capability = {
    lead_assign: "leads.update",
    task_filter: "tasks.view",
    approval_reviewer: "approvals.decide",
    job_sheet_owner: "job_sheets.update_billing",
    job_sheet_owner_filter: "job_sheets.view",
    admin_access: "permissions.override",
    admin_directory: "users.view",
    successor: "users.manage",
  } as const;
  await requireCapability(
    capability[purpose],
    (purpose === "approval_reviewer" || purpose === "lead_assign") && resourceId
      ? { resourceType: purpose === "lead_assign" ? "lead" : "human_approval", resourceId }
      : {},
    context,
  );
}

export const listAssignableProfilesFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(SearchSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requirePurpose(data.purpose, context, data.resourceId);
    return listAssignableProfiles(data, context);
  });

export const resolveAssignableProfileFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(ResolveSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requirePurpose(data.purpose, context, data.resourceId);
    return resolveAssignableProfile(data, context);
  });
