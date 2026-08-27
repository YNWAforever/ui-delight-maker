import { createServerFn } from "@tanstack/react-start";
import type { Quote, QuoteVersion } from "@/lib/types";
import {
  evaluateCapabilityChecks,
  requireCapability,
  requireCapabilityChecks,
} from "@/server/auth/authorization.server";
import {
  loadQuoteCreateBootstrap,
  loadQuoteDocumentRead,
  type QuoteCreateBootstrapInput,
} from "@/server/read-models/quote-workspace";
import {
  getQuoteWorkspaceDetail,
  listQuoteReferencePage,
  type QuoteReferenceKind,
  type QuoteReferencePage,
  type QuoteReferencePageInput,
} from "@/server/repositories/quotes";
import { listQuoteVersionSummariesPage } from "@/server/repositories/quote-versions";

export type { QuoteReferenceKind, QuoteReferencePage } from "@/server/repositories/quotes";

function optionalId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseBootstrapInput(data: unknown): QuoteCreateBootstrapInput {
  const candidate = (data ?? {}) as Record<string, unknown>;
  return {
    leadId: optionalId(candidate.leadId),
    clientId: optionalId(candidate.clientId),
    productId: optionalId(candidate.productId),
  };
}

function parseReferenceInput(data: unknown): QuoteReferencePageInput {
  const candidate = (data ?? {}) as Record<string, unknown>;
  if (!["lead", "client", "product", "pricing"].includes(String(candidate.kind))) {
    throw new Error("Invalid quote reference kind");
  }
  return {
    kind: candidate.kind as QuoteReferenceKind,
    search: optionalId(candidate.search),
    selectedId: optionalId(candidate.selectedId),
    page: typeof candidate.page === "number" ? candidate.page : undefined,
    limit: typeof candidate.limit === "number" ? candidate.limit : undefined,
  };
}

function parseIdInput(data: unknown) {
  const id = optionalId((data as { id?: unknown } | null)?.id);
  if (!id) throw new Error("Quote ID is required");
  return { id };
}

function parseVersionInput(data: unknown) {
  const candidate = (data ?? {}) as Record<string, unknown>;
  const { id } = parseIdInput(candidate);
  return {
    id,
    page: typeof candidate.page === "number" ? candidate.page : undefined,
    limit: typeof candidate.limit === "number" ? candidate.limit : undefined,
  };
}

const referenceCapabilities = {
  lead: "leads.view",
  client: "accounts.view",
  product: "products.view",
  pricing: null,
} as const;

export const getQuoteCreateBootstrap = createServerFn({ method: "GET" })
  .validator(parseBootstrapInput)
  .handler(async ({ data }) => {
    await requireCapabilityChecks([
      { capability: "quotes.view" },
      { capability: "leads.view" },
      { capability: "accounts.view" },
      { capability: "products.view" },
    ]);
    return loadQuoteCreateBootstrap(data);
  });

export const getQuoteReferencePage = createServerFn({ method: "GET" })
  .validator(parseReferenceInput)
  .handler(async ({ data }): Promise<QuoteReferencePage> => {
    const capability = referenceCapabilities[data.kind];
    await requireCapabilityChecks([
      { capability: "quotes.view" },
      ...(capability ? [{ capability }] : []),
    ]);
    return listQuoteReferencePage(data);
  });

async function authorizeQuote(id: string) {
  await requireCapability("quotes.view", { resourceType: "quote", resourceId: id });
}

/**
 * Which of a quote's linked parties this actor may see.
 *
 * The client check still throws: a client is the quote's counterparty, and a quote with
 * its client silently removed is a misleading document. The lead degrades instead —
 * `accounting` holds `quotes.view` without `leads.view`, so requiring the lead made every
 * lead-linked row that role is allowed to see in the list throw when opened. A lead is
 * provenance; nothing the quote says depends on it, so the quote still reads correctly once
 * every trace of the lead is stripped — see `redactLeadIdentity` for what "every" means.
 */
async function resolveLinkedQuoteVisibility(read: {
  quote: { client_id?: string | null; lead_id?: string | null };
}): Promise<{ lead: boolean }> {
  if (read.quote.client_id) {
    await requireCapability("accounts.view", {
      resourceType: "client",
      resourceId: read.quote.client_id,
    });
  }

  if (!read.quote.lead_id) return { lead: false };

  const [leadDecision] = await evaluateCapabilityChecks([
    {
      capability: "leads.view",
      target: { resourceType: "lead", resourceId: read.quote.lead_id },
    },
  ]);

  return { lead: leadDecision.allowed };
}

/**
 * The fields to overwrite on a quote read whose lead this actor may not see.
 *
 * Dropping the `lead` object is not enough. `QUOTE_COLUMNS` selects `lead_id` onto the quote
 * row itself, so a read that only nulls `lead` still hands the actor the primary key of the
 * record they were just denied — and the quote header renders it: both `quotes.$id` and the
 * PDF route fall back to `quote.lead_id` for their title, so the raw UUID appears on screen.
 * The id is the identity here; redacting the object while keeping the id redacts nothing.
 * Null the id too, and the title falls through to a neutral label.
 */
function redactLeadIdentity(quote: Quote) {
  return { lead: null, quote: { ...quote, lead_id: null } };
}

/**
 * The same redaction for a stored document version: `buildNormalizedQuoteSnapshot` spreads the
 * whole quote row into the snapshot, so each version carries its own copy of `lead_id`.
 * A snapshot is typed `JsonValue`, so anything that is not a plain object is passed through
 * untouched. This shapes the response only — the stored version is never rewritten.
 */
function redactLeadIdentityFromVersion(version: QuoteVersion): QuoteVersion {
  const { snapshot } = version;
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) return version;
  return { ...version, snapshot: { ...snapshot, lead_id: null } };
}

export const getQuoteDetailRead = createServerFn({ method: "GET" })
  .validator(parseIdInput)
  .handler(async ({ data }) => {
    await authorizeQuote(data.id);
    const read = await getQuoteWorkspaceDetail(data.id);
    const visibility = await resolveLinkedQuoteVisibility(read);
    return visibility.lead ? read : { ...read, ...redactLeadIdentity(read.quote) };
  });

export const getQuoteVersionsSection = createServerFn({ method: "GET" })
  .validator(parseVersionInput)
  .handler(async ({ data }) => {
    await authorizeQuote(data.id);
    return listQuoteVersionSummariesPage(data.id, data);
  });

export const getQuoteDocumentRead = createServerFn({ method: "GET" })
  .validator(parseIdInput)
  .handler(async ({ data }) => {
    await authorizeQuote(data.id);
    const read = await loadQuoteDocumentRead(data.id);
    const visibility = await resolveLinkedQuoteVisibility(read);
    if (visibility.lead) return read;
    return {
      ...read,
      ...redactLeadIdentity(read.quote),
      versions: read.versions.map(redactLeadIdentityFromVersion),
    };
  });
