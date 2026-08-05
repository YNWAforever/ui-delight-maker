import { requireCapability } from "@/server/auth/authorization.server";
// src/server-functions/client-import.ts
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { validateImportRows, type ImportRow } from "@/lib/csv-import";
import { commitClientImport } from "@/server/repositories/client-import";
import { listProducts } from "@/server/repositories/products";
import { query } from "@/server/db/neon.server";

async function loadValidationContext() {
  const [products, owners] = await Promise.all([
    listProducts({ activeOnly: true }),
    query<{ email: string }>("select email from profiles where email is not null"),
  ]);
  return {
    knownProducts: new Set(products.map((p) => p.name)),
    knownOwners: new Set(owners.map((o) => o.email)),
  };
}

export const validateClientImportRows = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { rows: ImportRow[] })
  .handler(async ({ data }) => {
    await requireCapability("accounts.view");
    await requireNeonAuthSession();
    const context = await loadValidationContext();
    return validateImportRows(data.rows, context);
  });

export const commitClientImportFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { rows: ImportRow[] })
  .handler(async ({ data }) => {
    await requireCapability("accounts.create");
    const session = await requireNeonAuthSession();
    // Defense in depth: this endpoint is gated behind an authenticated
    // session, and the wizard UI only ever sends the `valid` subset from an
    // earlier validateClientImportRows call — but re-validating here is cheap
    // and guards against a stale client-side "valid" set (e.g. a product
    // deactivated, or an owner removed, between the validate and commit
    // steps) without trusting whatever rows the client happens to send.
    const context = await loadValidationContext();
    const { valid } = validateImportRows(data.rows, context);
    return commitClientImport(valid, session.profile.id);
  });
