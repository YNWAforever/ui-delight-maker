import { parseOperationInput } from "@/lib/operations/errors";
import { loadRequestAuthorization, requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  IdSchema,
  JobSheetMutationSchema,
  XeroConfirmSchema,
  XeroCorrectSchema,
  XeroNotesSchema,
} from "@/lib/operations/input-schemas";
import {
  acceptJobSheet as acceptJobSheetInRepository,
  getJobSheet as getJobSheetFromRepository,
  listJobSheets,
  listJobSheetsPage,
  replaceJobSheetPortions,
  type JobSheetFilters,
  type JobSheetPageFilters,
} from "@/server/repositories/job-sheets";
import {
  confirmXeroEntryCommand,
  correctXeroEntryCommand,
  updateXeroNotesCommand,
} from "@/server/commands/billing-portion.server";

export const getJobSheets = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as JobSheetFilters)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("job_sheets.view", {}, context);
    return listJobSheets(data, context);
  });

export const getJobSheetsPage = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as JobSheetPageFilters)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("job_sheets.view", {}, context);
    return listJobSheetsPage(data, context);
  });

export const getJobSheet = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(IdSchema, data))
  .handler(async ({ data }) => {
    await requireCapability("job_sheets.view", { resourceType: "job_sheet", resourceId: data.id });
    await requireNeonAuthSession();
    return getJobSheetFromRepository(data.id);
  });

export const updateJobSheetPortions = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(JobSheetMutationSchema, data))
  .handler(async ({ data }) => {
    await requireCapability("job_sheets.update_billing", {
      resourceType: "job_sheet",
      resourceId: data.id,
    });
    await requireNeonAuthSession();
    return replaceJobSheetPortions(data.id, data.portions);
  });

export const acceptJobSheetForAccounting = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(IdSchema, data))
  .handler(async ({ data }) => {
    await requireCapability("job_sheets.accept", {
      resourceType: "job_sheet",
      resourceId: data.id,
    });
    const session = await requireNeonAuthSession();
    return acceptJobSheetInRepository(data.id, { accepted_by: session.profile.id });
  });

export const updateXeroNotes = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(XeroNotesSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "job_sheets.update_billing",
      { resourceType: "job_sheet_portion", resourceId: data.portionId },
      context,
    );
    return updateXeroNotesCommand(context, data);
  });

export const confirmXeroEntry = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(XeroConfirmSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "job_sheets.update_billing",
      { resourceType: "job_sheet_portion", resourceId: data.portionId },
      context,
    );
    return confirmXeroEntryCommand(context, data);
  });

export const correctXeroEntry = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(XeroCorrectSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "job_sheets.update_billing",
      { resourceType: "job_sheet_portion", resourceId: data.portionId },
      context,
    );
    return correctXeroEntryCommand(context, data);
  });

// A stale client may still import the old symbol, but its old invoice payload
// fails the strict notes-only validator instead of silently changing state.
export const updatePortionXeroReference = updateXeroNotes;
