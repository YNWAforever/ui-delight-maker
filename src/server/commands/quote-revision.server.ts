import type { Quote, QuoteVersion } from "@/lib/types";
import type { QuoteCommercialPatchInput, QuoteRevisionInput } from "@/lib/operations/input-schemas";
import { OperationError } from "@/lib/operations/errors";
import { evaluateAuthorization } from "@/lib/admin/policy";
import type { Capability, PermissionOverride, UserRole } from "@/lib/admin/types";
import { readQuotePdfSnapshot } from "@/lib/quote-pdf-source";
import { calculateQuoteTotal } from "@/lib/quote-to-cash";
import { toJsonValue } from "@/lib/serializable";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { transaction, type Queryable } from "@/server/db/neon.server";
import { createQuote, updateQuote, updateQuoteLifecycle } from "@/server/repositories/quotes";
import { createQuoteVersion } from "@/server/repositories/quote-versions";
import { claimCommandReceipt, completeCommandReceipt } from "./receipts.server";

type LockedQuote = Quote & { account_owner: string | null };
type ProfileState = { role: UserRole; status: string };
type OverrideRow = {
  profile_id: string;
  capability: Capability;
  effect: "allow" | "deny";
  department_id: string | null;
  team_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

async function lockQuoteAndAuthorize(
  db: Queryable,
  context: RequestAuthorization,
  id: string,
  capabilities: readonly Capability[],
): Promise<LockedQuote> {
  const quote = (
    await db.query<LockedQuote>(
      `select q.*, a.account_owner
       from quotes q left join accounts a on a.id=q.account_id
       where q.id=$1 for update of q`,
      [id],
    )
  ).rows[0];
  if (!quote) throw new OperationError("NOT_FOUND", "Quote is unavailable");
  const actor = (
    await db.query<ProfileState>("select role,status from profiles where id=$1 for share", [
      context.actor.profileId,
    ])
  ).rows[0];
  if (!actor || actor.status !== "active") {
    throw new OperationError("FORBIDDEN", "Quote action is not authorized");
  }
  const rows = (
    await db.query<OverrideRow>(
      `select profile_id,capability,effect,department_id,team_id,resource_type,
              resource_id,expires_at,revoked_at from permission_overrides
       where profile_id=$1 and revoked_at is null
         and (expires_at is null or expires_at>now())`,
      [context.actor.profileId],
    )
  ).rows;
  const overrides: PermissionOverride[] = rows.map((row) => ({
    profileId: row.profile_id,
    capability: row.capability,
    effect: row.effect,
    departmentId: row.department_id,
    teamId: row.team_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }));
  const ownerProfileId = quote.created_by ?? quote.account_owner;
  const currentActor = { ...context.actor, role: actor.role, status: actor.status as "active" };
  for (const capability of capabilities) {
    const target =
      capability === "quotes.create"
        ? {}
        : {
            resourceType: "quote",
            resourceId: quote.id,
            ...(ownerProfileId ? { ownerProfileId } : {}),
          };
    const decision = evaluateAuthorization({
      actor: currentActor,
      capability,
      target,
      overrides,
      now: new Date(),
    });
    if (!decision.allowed) throw new OperationError("FORBIDDEN", "Quote action is not authorized");
  }
  return quote;
}

/** Status and actor scope are checked against locked/current rows before any commercial write. */
export async function updateQuoteCommercial(
  context: RequestAuthorization,
  input: { id: string; patch: QuoteCommercialPatchInput },
): Promise<Quote> {
  return transaction(async (db) => {
    const current = await lockQuoteAndAuthorize(db, context, input.id, ["quotes.update"]);
    if (current.status !== "draft" && current.status !== "revised") {
      throw new OperationError("INVALID_STATE", "Quote commercial content is locked");
    }
    return updateQuote(input.id, input.patch, db);
  });
}

export type QuoteRevisionResult = { quote: Quote; version: QuoteVersion };

export async function createQuoteRevisionInTransaction(
  db: Queryable,
  context: RequestAuthorization,
  input: QuoteRevisionInput,
): Promise<QuoteRevisionResult> {
  const parent = await lockQuoteAndAuthorize(db, context, input.id, [
    "quotes.view",
    "quotes.update",
    "quotes.create",
  ]);
  const currentVersionId =
    parent.status === "accepted"
      ? parent.accepted_version_id
      : parent.status === "sent" || parent.status === "viewed"
        ? parent.issued_version_id
        : null;
  if (!currentVersionId || currentVersionId !== input.baseVersionId) {
    throw new OperationError("CONFLICT", "Current immutable quote version is unavailable");
  }
  const base = (
    await db.query<QuoteVersion>("select * from quote_versions where id=$1 and quote_id=$2", [
      input.baseVersionId,
      parent.id,
    ])
  ).rows[0];
  const raw = base?.snapshot;
  const snapshot = raw ? readQuotePdfSnapshot(raw) : null;
  if (
    !base ||
    !snapshot ||
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    raw.id !== parent.id
  ) {
    throw new OperationError("INVALID_STATE", "Immutable quote snapshot needs reconciliation");
  }
  for (const field of ["lead_id", "client_id", "contact_id", "account_id", "deal_id"] as const) {
    if (!(field in raw) || raw[field] !== parent[field]) {
      throw new OperationError("INVALID_STATE", "Quote identity needs reconciliation");
    }
  }

  const claim = await claimCommandReceipt<QuoteRevisionResult>(db, {
    scope: "quote.revision",
    actorId: context.actor.profileId,
    idempotencyKey: input.idempotencyKey,
    payload: {
      id: input.id,
      baseVersionId: input.baseVersionId,
      reason: input.reason,
      notes: input.notes ?? null,
      patch: input.patch ?? {},
    },
  });
  if (claim.kind === "replay") return claim.result;

  const patch = input.patch ?? {};
  const items = patch.line_items ?? snapshot.lineItems;
  const computedTotal = calculateQuoteTotal(items);
  if (patch.line_items && patch.total_value != null && patch.total_value !== computedTotal) {
    throw new OperationError("INVALID_STATE", "Revised total differs from line items");
  }
  const total =
    patch.total_value !== undefined
      ? patch.total_value
      : patch.line_items
        ? computedTotal
        : snapshot.quote.total_value;
  const draft = await createQuote(
    {
      lead_id: parent.lead_id,
      client_id: parent.client_id,
      contact_id: parent.contact_id,
      account_id: parent.account_id,
      deal_id: parent.deal_id,
      quote_template_id: parent.quote_template_id,
      currency: patch.currency ?? snapshot.quote.currency,
      line_items: items,
      total_value: total,
      valid_until: patch.valid_until !== undefined ? patch.valid_until : snapshot.quote.valid_until,
      document_sections: patch.document_sections ?? snapshot.quote.document_sections,
      cover_text: patch.cover_text !== undefined ? patch.cover_text : snapshot.quote.cover_text,
      assumptions: patch.assumptions !== undefined ? patch.assumptions : snapshot.quote.assumptions,
      payment_terms:
        patch.payment_terms !== undefined ? patch.payment_terms : snapshot.quote.payment_terms,
      created_by: context.actor.profileId,
    },
    db,
  );
  await updateQuote(
    draft.id,
    {
      parent_quote_id: parent.id,
      change_order_reason: input.reason === "change_order" ? (input.notes ?? "Change order") : null,
    },
    db,
  );
  const revision = await updateQuoteLifecycle(draft.id, { status: "revised" }, db);
  const version = await createQuoteVersion(
    {
      quote_id: parent.id,
      reason: input.reason,
      snapshot: toJsonValue({
        ...revision,
        id: parent.id,
        total_value: total,
        line_items: items,
        base_version_id: base.id,
        revision_quote_id: revision.id,
      }),
      created_by: context.actor.profileId,
    },
    db,
  );
  const result = { quote: revision, version };
  await completeCommandReceipt(db, claim.id, result);
  return result;
}

export async function createQuoteRevision(
  context: RequestAuthorization,
  input: QuoteRevisionInput,
): Promise<QuoteRevisionResult> {
  return transaction((db) => createQuoteRevisionInTransaction(db, context, input));
}
