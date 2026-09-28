import { parseOperationInput } from "@/lib/operations/errors";
import { requireCapability } from "@/server/auth/authorization.server";
// src/server-functions/client-import.ts
import { createServerFn } from "@tanstack/react-start";
import { ImportRowsSchema } from "@/lib/operations/input-schemas";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { validateImportRows } from "@/lib/csv-import";
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
  .validator((data: unknown) => parseOperationInput(ImportRowsSchema, data))
  .handler(async ({ data }) => {
    await requireCapability("accounts.view");
    await requireNeonAuthSession();
    const context = await loadValidationContext();
    return validateImportRows(data.rows, context);
  });

export const commitClientImportFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(ImportRowsSchema, data))
  .handler(async () => {
    await requireNeonAuthSession();
    throw new Error("Direct CSV commit is retired. Preview the file again.");
  });
