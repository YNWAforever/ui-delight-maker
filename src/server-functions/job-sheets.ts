import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import type { NewJobSheetPortion } from "@/lib/quote-to-cash";
import {
  acceptJobSheet as acceptJobSheetInRepository,
  getJobSheet as getJobSheetFromRepository,
  listJobSheets,
  replaceJobSheetPortions,
  updateJobSheetXeroReference,
  type JobSheetFilters,
  type UpdateJobSheetXeroReferenceInput,
} from "@/server/repositories/job-sheets";

export const getJobSheets = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as JobSheetFilters)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return listJobSheets(data);
  });

export const getJobSheet = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return getJobSheetFromRepository(data.id);
  });

export const updateJobSheetPortions = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; portions: NewJobSheetPortion[] })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return replaceJobSheetPortions(data.id, data.portions);
  });

export const acceptJobSheetForAccounting = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    return acceptJobSheetInRepository(data.id, { accepted_by: session.user.id });
  });

export const updatePortionXeroReference = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as UpdateJobSheetXeroReferenceInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return updateJobSheetXeroReference(data);
  });
