import type { JsonValue, Quote, QuoteVersion } from "@/lib/types";
import {
  getQuoteWorkspaceDetail,
  listQuoteCreatePricingTemplates,
  listQuoteReferencePage,
  type QuoteReferenceKind,
  type QuoteReferencePage,
  type QuoteReferencePageInput,
} from "@/server/repositories/quotes";
import {
  listCompactQuotePdfTemplates,
  listRecentQuoteTemplates,
} from "@/server/repositories/quote-templates";
import {
  getQuoteDocumentVersion,
  listQuoteVersionSummariesPage,
} from "@/server/repositories/quote-versions";

export type {
  QuoteReferenceItemMap,
  QuoteReferenceKind,
  QuoteReferencePage,
  QuoteReferencePageInput,
} from "@/server/repositories/quotes";

export type QuoteCreateBootstrapInput = {
  leadId?: string;
  clientId?: string;
  productId?: string;
};

export async function loadQuoteCreateBootstrap(input: QuoteCreateBootstrapInput = {}) {
  const [pricingTemplates, quoteTemplates, pdfTemplates, leads, clients, products] =
    await Promise.all([
      listQuoteCreatePricingTemplates(10, input.productId),
      listRecentQuoteTemplates(10),
      listCompactQuotePdfTemplates(10),
      listQuoteReferencePage({ kind: "lead", selectedId: input.leadId, page: 1, limit: 25 }),
      listQuoteReferencePage({
        kind: "client",
        selectedId: input.clientId,
        page: 1,
        limit: 25,
      }),
      listQuoteReferencePage({
        kind: "product",
        selectedId: input.productId,
        page: 1,
        limit: 25,
      }),
    ]);

  return { pricingTemplates, quoteTemplates, pdfTemplates, leads, clients, products };
}

export function loadQuoteReferencePage<K extends QuoteReferenceKind>(
  input: QuoteReferencePageInput<K>,
): Promise<QuoteReferencePage<K>> {
  return listQuoteReferencePage(input);
}

export function loadQuoteDetailRead(id: string) {
  return getQuoteWorkspaceDetail(id);
}

export function loadQuoteVersionsSection(
  id: string,
  input: { page?: number; limit?: number } = {},
) {
  return listQuoteVersionSummariesPage(id, input);
}

function immutableVersionId(quote: Quote) {
  if (quote.status === "accepted") {
    if (!quote.accepted_version_id) {
      throw new Error("Accepted quote has no immutable accepted version");
    }
    return quote.accepted_version_id;
  }
  if (quote.status === "sent" || quote.status === "viewed") {
    if (!quote.issued_version_id) {
      throw new Error(
        `${quote.status === "sent" ? "Sent" : "Viewed"} quote has no immutable issued version`,
      );
    }
    return quote.issued_version_id;
  }
  return quote.accepted_version_id ?? quote.issued_version_id ?? null;
}

function isImmutableQuoteSnapshot(
  snapshot: JsonValue,
  quoteId: string,
): snapshot is Record<string, JsonValue> {
  return (
    snapshot !== null &&
    !Array.isArray(snapshot) &&
    typeof snapshot === "object" &&
    snapshot.id === quoteId &&
    Array.isArray(snapshot.line_items)
  );
}

function assertImmutableDocumentVersion(
  version: QuoteVersion | null,
  quoteId: string,
): asserts version is QuoteVersion {
  if (
    !version ||
    version.quote_id !== quoteId ||
    !isImmutableQuoteSnapshot(version.snapshot, quoteId)
  ) {
    throw new Error("Immutable quote snapshot is missing or malformed");
  }
}

export async function loadQuoteDocumentRead(id: string) {
  const detail = await getQuoteWorkspaceDetail(id);
  const pointer = immutableVersionId(detail.quote);
  if (!pointer) return { ...detail, versions: [] };

  const version = await getQuoteDocumentVersion(id, pointer);
  assertImmutableDocumentVersion(version, id);

  return { ...detail, versions: [version] };
}

export type QuoteCreateBootstrapRead = Awaited<ReturnType<typeof loadQuoteCreateBootstrap>>;
export type QuoteDetailRead = Awaited<ReturnType<typeof loadQuoteDetailRead>>;
export type QuoteVersionsSectionRead = Awaited<ReturnType<typeof loadQuoteVersionsSection>>;
export type QuoteDocumentRead = Awaited<ReturnType<typeof loadQuoteDocumentRead>>;
