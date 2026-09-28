import { createServerFn } from "@tanstack/react-start";
import {
  BulkCommitRequestSchema,
  BulkPreviewRequestSchema,
  BulkResumeRequestSchema,
} from "@/lib/operations/bulk-contract";
import { parseOperationInput } from "@/lib/operations/errors";
import { loadRequestAuthorization } from "@/server/auth/authorization.server";
import { productionBulkHandler } from "@/server/operations/bulk-actions.server";
import { createBulkService } from "@/server/operations/bulk.server";

const service = createBulkService({ handler: productionBulkHandler });

export const previewBulkFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(BulkPreviewRequestSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    return service.previewBulk(context, data);
  });

export const commitBulkFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(BulkCommitRequestSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    return service.commitBulk(context, data);
  });

export const resumeBulkFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(BulkResumeRequestSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    return service.resumeBulk(context, data);
  });

export const getBulkResultFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(BulkResumeRequestSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    return service.getBulkResult(context, data);
  });
