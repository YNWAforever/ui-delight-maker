import { requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";

import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { validateEventImportRows, type EventImportRow } from "@/lib/relationship/event-import";
import {
  commitEventImport,
  listEventImportAccountCandidates,
  listEventImportAccountContacts,
} from "@/server/repositories/event-import";

async function loadEventImportValidationContext() {
  const [accounts, accountContacts] = await Promise.all([
    listEventImportAccountCandidates(),
    listEventImportAccountContacts(),
  ]);
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
      ...(await loadEventImportValidationContext()),
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
      ...(await loadEventImportValidationContext()),
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
