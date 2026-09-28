import { parseOperationInput } from "@/lib/operations/errors";
import {
  checkWithContext,
  loadRequestAuthorization,
  requireCapability,
  type RequestAuthorization,
} from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";

import { EventImportCommitSchema, EventImportRowsSchema } from "@/lib/operations/input-schemas";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  resolveMatchedAccountIds,
  validateEventImportRows,
  type EventImportRow,
} from "@/lib/relationship/event-import";
import {
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

/** Hide matches to records the actor cannot view without turning them into new accounts. */
async function validateVisibleEventRows(rows: EventImportRow[], ctx: RequestAuthorization) {
  const validation = validateEventImportRows({
    rows,
    ...(await loadEventImportValidationContext(rows)),
  });
  const valid: typeof validation.valid = [];
  const errors = [...validation.errors];
  const invalidIndexes = new Set(errors.map(({ index }) => index));
  let validIndex = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (invalidIndexes.has(index)) continue;
    const row = validation.valid[validIndex++];
    const checks = [];
    if (row.account_match.kind === "matched") {
      checks.push({
        capability: "accounts.view" as const,
        target: { resourceType: "account", resourceId: row.account_match.accountId },
      });
    }
    if (row.contact_match.kind === "matched") {
      checks.push({
        capability: "contacts.view" as const,
        target: { resourceType: "account_contact", resourceId: row.contact_match.contactId },
      });
    }
    const decisions = await checkWithContext(ctx, checks);
    if (decisions.some((decision) => !decision.allowed)) {
      errors.push({ index, reason: "Import row requires review." });
    } else {
      valid.push(row);
    }
  }
  return { valid, errors: errors.sort((a, b) => a.index - b.index) };
}

export const validateEventImportRowsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(EventImportRowsSchema, data))
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const authorization = await loadRequestAuthorization(session);
    await requireCapability("engagements.view", {}, authorization);
    await requireCapability("accounts.view", {}, authorization);
    await requireCapability("contacts.view", {}, authorization);
    return validateVisibleEventRows(data.rows, authorization);
  });

export const commitEventImportFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(EventImportCommitSchema, data))
  .handler(async () => {
    await requireNeonAuthSession();
    throw new Error("Direct CSV commit is retired. Preview the file again.");
  });
