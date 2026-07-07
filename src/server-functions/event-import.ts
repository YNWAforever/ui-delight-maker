import { createServerFn } from "@tanstack/react-start";

import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  validateEventImportRows,
  type EventImportRow,
} from "@/lib/relationship/event-import";
import { listAccounts } from "@/server/repositories/accounts";
import { commitEventImport } from "@/server/repositories/event-import";

export const validateEventImportRowsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { rows: EventImportRow[] })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    const accounts = await listAccounts({});
    return validateEventImportRows({ rows: data.rows, accounts });
  });

export const commitEventImportFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { campaignId: string; rows: EventImportRow[] })
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const accounts = await listAccounts({});
    const validation = validateEventImportRows({ rows: data.rows, accounts });

    if (validation.errors.length > 0) {
      return { ok: false as const, errors: validation.errors };
    }

    return commitEventImport({
      campaignId: data.campaignId,
      rows: validation.valid,
      owner: session.user.id,
    });
  });
