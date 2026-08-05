import { requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import type { NewJobSheetPortion } from "@/lib/quote-to-cash";
import {
  acceptJobSheet as acceptJobSheetInRepository,
  getJobSheet as getJobSheetFromRepository,
  listJobSheets,
  listJobSheetsPage,
  replaceJobSheetPortions,
  updateJobSheetXeroReference,
  type JobSheetFilters,
  type JobSheetPageFilters,
  type UpdateJobSheetXeroReferenceInput,
} from "@/server/repositories/job-sheets";

export const getJobSheets = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as JobSheetFilters)
  .handler(async ({ data }) => {
    await requireCapability("job_sheets.view");
    await requireNeonAuthSession();
    return listJobSheets(data);
  });

export const getJobSheetsPage = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as JobSheetPageFilters)
  .handler(async ({ data }) => {
    await requireCapability("job_sheets.view");
    await requireNeonAuthSession();
    return listJobSheetsPage(data);
  });

export const getJobSheet = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireCapability("job_sheets.view", { resourceType: "job_sheet", resourceId: data.id });
    await requireNeonAuthSession();
    return getJobSheetFromRepository(data.id);
  });

export const updateJobSheetPortions = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; portions: NewJobSheetPortion[] })
  .handler(async ({ data }) => {
    await requireCapability("job_sheets.update_billing", {
      resourceType: "job_sheet",
      resourceId: data.id,
    });
    await requireNeonAuthSession();
    return replaceJobSheetPortions(data.id, data.portions);
  });

export const acceptJobSheetForAccounting = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireCapability("job_sheets.accept", {
      resourceType: "job_sheet",
      resourceId: data.id,
    });
    const session = await requireNeonAuthSession();
    return acceptJobSheetInRepository(data.id, { accepted_by: session.profile.id });
  });

export const updatePortionXeroReference = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as UpdateJobSheetXeroReferenceInput)
  .handler(async ({ data }) => {
    await requireCapability("job_sheets.update_billing", {
      resourceType: "job_sheet_portion",
      resourceId: data.portion_id,
    });
    await requireNeonAuthSession();
    return updateJobSheetXeroReference(data);
  });
