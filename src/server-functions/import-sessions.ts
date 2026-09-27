import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseOperationInput } from "@/lib/operations/errors";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { loadRequestAuthorization, requireCapability } from "@/server/auth/authorization.server";
import { createImportService } from "@/server/imports/import-session.server";
import { productionImportHandler } from "@/server/imports/import-actions.server";

const Id = z.string().uuid();
const PreviewSchema = z.strictObject({
  kind: z.enum(["lead", "client", "event"]),
  csvText: z.string().max(5 * 1024 * 1024),
  sourceNamespace: z
    .string()
    .regex(/^[a-zA-Z0-9_.:-]{1,100}$/)
    .optional(),
  campaignId: Id.optional(),
});
const CommitSchema = z.strictObject({
  sessionId: Id,
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().min(1).max(200),
});
const SessionSchema = z.strictObject({ sessionId: Id });

const importService = createImportService({ handler: productionImportHandler });

export const previewImportFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(PreviewSchema, data))
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const authorization = await loadRequestAuthorization(session);
    if (data.kind === "lead") await requireCapability("leads.view", {}, authorization);
    else if (data.kind === "client") await requireCapability("accounts.view", {}, authorization);
    else {
      if (!data.campaignId) throw new Error("Campaign ID is required");
      await requireCapability("engagements.view", {}, authorization);
      await requireCapability(
        "campaigns.manage",
        {
          resourceType: "campaign",
          resourceId: data.campaignId,
        },
        authorization,
      );
    }
    return importService.previewImport(authorization, data);
  });

export const commitImportFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(CommitSchema, data))
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const authorization = await loadRequestAuthorization(session);
    return importService.commitImport(authorization, data);
  });

export const resumeImportFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(SessionSchema, data))
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const authorization = await loadRequestAuthorization(session);
    return importService.resumeImport(authorization, data);
  });

export const getImportResultFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(SessionSchema, data))
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const authorization = await loadRequestAuthorization(session);
    return importService.getImportResult(authorization, data);
  });
