import { parseOperationInput } from "@/lib/operations/errors";
import { loadRequestAuthorization, requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
  updateJobSheetHeader as updateJobSheetHeaderInRepository,
} from "@/server/repositories/job-sheets";
import {
  confirmXeroEntryCommand,
  correctXeroEntryCommand,
  updateXeroNotesCommand,
} from "@/server/commands/billing-portion.server";

const JobSheetFilterSchema = z.strictObject({
  status: z
    .enum(["draft", "accounting_review", "accepted", "change_required", "cancelled"])
    .optional(),
  client_id: z.string().uuid().optional(),
  account_id: z.string().uuid().optional(),
  company: z.string().trim().max(200).optional(),
  quoteNumber: z.string().trim().max(100).optional(),
  accountingOwner: z.string().max(200).optional(),
  po: z.string().trim().max(100).optional(),
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
});
const JobSheetPageSchema = JobSheetFilterSchema.extend({
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const getJobSheets = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(JobSheetFilterSchema, data ?? {}))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("job_sheets.view", {}, context);
    return listJobSheets(data, context);
  });

export const getJobSheetsPage = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(JobSheetPageSchema, data ?? {}))
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

const JobSheetHeaderSchema = z.strictObject({
  id: z.string().uuid(),
  accountingOwner: z.string().min(1).max(200),
  poNumber: z.string().max(100).nullable(),
  noPoReason: z.string().max(500).nullable(),
  clientOrder: z.string().max(100).nullable(),
  billingInstructions: z.string().max(2000).nullable(),
  acceptedScopeSummary: z.string().max(2000).nullable().optional(),
});

export const updateJobSheetHeader = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(JobSheetHeaderSchema, data))
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const context = await loadRequestAuthorization(session);
    await requireCapability(
      "job_sheets.update_billing",
      { resourceType: "job_sheet", resourceId: data.id },
      context,
    );
    return updateJobSheetHeaderInRepository(data.id, data, session.profile.id);
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
