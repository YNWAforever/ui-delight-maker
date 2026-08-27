import { createServerFn } from "@tanstack/react-start";
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
 * provenance; its absence changes nothing the quote says.
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

export const getQuoteDetailRead = createServerFn({ method: "GET" })
  .validator(parseIdInput)
  .handler(async ({ data }) => {
    await authorizeQuote(data.id);
    const read = await getQuoteWorkspaceDetail(data.id);
    const visibility = await resolveLinkedQuoteVisibility(read);
    return visibility.lead ? read : { ...read, lead: null };
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
    return visibility.lead ? read : { ...read, lead: null };
  });
