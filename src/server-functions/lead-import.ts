import { parseOperationInput } from "@/lib/operations/errors";
// src/server-functions/lead-import.ts
import { createServerFn } from "@tanstack/react-start";
import { ImportRowsSchema } from "@/lib/operations/input-schemas";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { requireCapability } from "@/server/auth/authorization.server";
import { validateLeadImportRows } from "@/lib/lead-import";
import { query } from "@/server/db/neon.server";

async function loadValidationContext() {
  const owners = await query<{ email: string }>(
    "select email from profiles where email is not null",
  );
  return { knownOwners: new Set(owners.map((o) => o.email)) };
}

export const validateLeadImportRowsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(ImportRowsSchema, data))
  .handler(async ({ data }) => {
    await requireCapability("leads.view");
    await requireNeonAuthSession();
    const context = await loadValidationContext();
    return validateLeadImportRows(data.rows, context);
  });

export const commitLeadImportFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(ImportRowsSchema, data))
  .handler(async () => {
    await requireNeonAuthSession();
    throw new Error("Direct CSV commit is retired. Preview the file again.");
  });
