// src/server-functions/lead-import.ts
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { requireCapability } from "@/server/auth/authorization.server";
import { type ImportRow } from "@/lib/csv-import";
import { validateLeadImportRows } from "@/lib/lead-import";
import { commitLeadImport } from "@/server/repositories/lead-import";
import { query } from "@/server/db/neon.server";

async function loadValidationContext() {
  const owners = await query<{ email: string }>(
    "select email from profiles where email is not null",
  );
  return { knownOwners: new Set(owners.map((o) => o.email)) };
}

export const validateLeadImportRowsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { rows: ImportRow[] })
  .handler(async ({ data }) => {
    await requireCapability("leads.view");
    await requireNeonAuthSession();
    const context = await loadValidationContext();
    return validateLeadImportRows(data.rows, context);
  });

export const commitLeadImportFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { rows: ImportRow[] })
  .handler(async ({ data }) => {
    await requireCapability("leads.create");
    const session = await requireNeonAuthSession();
    // Defence in depth, matching the client importer: the wizard only ever sends the
    // `valid` subset from an earlier validate call, but an owner may have been removed
    // between the two steps, and this endpoint must not trust whatever rows a client
    // happens to send.
    const context = await loadValidationContext();
    const { valid } = validateLeadImportRows(data.rows, context);
    return commitLeadImport(valid, session.profile.id);
  });
