import { requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";

import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  resolveMatchedAccountIds,
  validateEventImportRows,
  type EventImportRow,
} from "@/lib/relationship/event-import";
import {
  commitEventImport,
  listEventImportAccountCandidates,
  listEventImportAccountContacts,
} from "@/server/repositories/event-import";

/**
 * Loads only what these rows can actually match against.
 *
 * Two phases rather than one parallel pair: the contact read is narrowed to the accounts the
 * rows matched, which is exact and turns the larger of the two reads from tenant-sized into
 * file-sized. The account read is narrowed by a superset prefilter — see
 * `listEventImportAccountCandidates`.
 */
async function loadEventImportValidationContext(rows: EventImportRow[]) {
  const accounts = await listEventImportAccountCandidates(rows.map((row) => row.company_name));
  const accountContacts = await listEventImportAccountContacts(
    resolveMatchedAccountIds({ rows, accounts }),
  );
  return { accounts, accountContacts };
}

export const validateEventImportRowsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { rows: EventImportRow[] })
  .handler(async ({ data }) => {
    await requireCapability("engagements.view");
    await requireCapability("accounts.view");
    await requireCapability("contacts.view");
    await requireNeonAuthSession();
    return validateEventImportRows({
      rows: data.rows,
      ...(await loadEventImportValidationContext(data.rows)),
    });
  });

export const commitEventImportFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { campaignId: string; rows: EventImportRow[] })
  .handler(async ({ data }) => {
    await requireCapability("engagements.create", {
      resourceType: "campaign",
      resourceId: data.campaignId,
    });
    await requireCapability("campaigns.manage", {
      resourceType: "campaign",
      resourceId: data.campaignId,
    });
    await requireCapability("accounts.create");
    await requireCapability("contacts.create");
    const session = await requireNeonAuthSession();
    const validation = validateEventImportRows({
      rows: data.rows,
      ...(await loadEventImportValidationContext(data.rows)),
    });

    if (validation.errors.length > 0) {
      return { ok: false as const, errors: validation.errors };
    }

    return commitEventImport({
      campaignId: data.campaignId,
      rows: validation.valid,
      owner: session.profile.id,
    });
  });
