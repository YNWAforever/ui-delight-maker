import { createServerFn } from "@tanstack/react-start";
import {
  requireCapability,
  requireCapabilityChecks,
  type CapabilityCheck,
} from "@/server/auth/authorization.server";
import {
  loadQuoteCreateBootstrap,
  loadQuoteDetailRead,
  loadQuoteDocumentRead,
  loadQuoteReferencePage,
  loadQuoteVersionsSection,
  type QuoteCreateBootstrapInput,
  type QuoteReferenceKind,
  type QuoteReferencePage,
  type QuoteReferencePageInput,
} from "@/server/read-models/quote-workspace";

export type { QuoteReferenceKind, QuoteReferencePage } from "@/server/read-models/quote-workspace";

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
    return loadQuoteReferencePage(data);
  });

async function authorizeQuote(id: string) {
  await requireCapability("quotes.view", { resourceType: "quote", resourceId: id });
}

async function authorizeLinkedQuoteParties(read: {
  quote: { client_id?: string | null; lead_id?: string | null };
}) {
  const checks: CapabilityCheck[] = [];
  if (read.quote.client_id) {
    checks.push({
      capability: "accounts.view",
      target: { resourceType: "client", resourceId: read.quote.client_id },
    });
  }
  if (read.quote.lead_id) {
    checks.push({
      capability: "leads.view",
      target: { resourceType: "lead", resourceId: read.quote.lead_id },
    });
  }
  if (checks.length) await requireCapabilityChecks(checks);
}

export const getQuoteDetailRead = createServerFn({ method: "GET" })
  .validator(parseIdInput)
  .handler(async ({ data }) => {
    await authorizeQuote(data.id);
    const read = await loadQuoteDetailRead(data.id);
    await authorizeLinkedQuoteParties(read);
    return read;
  });

export const getQuoteVersionsSection = createServerFn({ method: "GET" })
  .validator(parseVersionInput)
  .handler(async ({ data }) => {
    await authorizeQuote(data.id);
    return loadQuoteVersionsSection(data.id, data);
  });

export const getQuoteDocumentRead = createServerFn({ method: "GET" })
  .validator(parseIdInput)
  .handler(async ({ data }) => {
    await authorizeQuote(data.id);
    const read = await loadQuoteDocumentRead(data.id);
    await authorizeLinkedQuoteParties(read);
    return read;
  });
