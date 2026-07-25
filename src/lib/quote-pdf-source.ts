import type { JsonValue, Quote, QuoteLineItem, QuoteVersion } from "@/lib/types";
import { normalizeQuoteDocumentSections } from "@/lib/quote-document";

export type QuotePdfQuote = Pick<
  Quote,
  | "number"
  | "currency"
  | "total_value"
  | "valid_until"
  | "cover_text"
  | "assumptions"
  | "payment_terms"
  | "document_sections"
>;

type QuotePdfSourceInput = QuotePdfQuote &
  Pick<Quote, "status" | "accepted_version_id" | "issued_version_id" | "line_items">;

export type QuotePdfSourceError = {
  code: "missing_immutable_snapshot" | "invalid_immutable_snapshot";
  versionId: string;
  versionReason: "accepted" | "issued";
};

export type ResolvedQuotePdfSource =
  | {
      state: "live";
      quote: QuotePdfQuote;
      lineItems: QuoteLineItem[];
      sourceVersion: null;
      error: null;
    }
  | {
      state: "snapshot";
      quote: QuotePdfQuote;
      lineItems: QuoteLineItem[];
      sourceVersion: QuoteVersion;
      error: null;
    }
  | {
      state: "invalid";
      quote: null;
      lineItems: QuoteLineItem[];
      sourceVersion: QuoteVersion | null;
      error: QuotePdfSourceError;
    };

type QuotePdfSnapshotData = {
  quote: QuotePdfQuote;
  lineItems: QuoteLineItem[];
};

function isSnapshotRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSnapshotLineItem(value: JsonValue): QuoteLineItem | null {
  if (
    !isSnapshotRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.service !== "string" ||
    typeof value.description !== "string" ||
    typeof value.qty !== "number" ||
    typeof value.unit_price !== "number"
  ) {
    return null;
  }

  return {
    id: value.id,
    service: value.service,
    description: value.description,
    qty: value.qty,
    unit_price: value.unit_price,
  };
}

function readSnapshotLineItems(value: JsonValue): QuoteLineItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const lineItems = value.map(readSnapshotLineItem);
  return lineItems.every((lineItem): lineItem is QuoteLineItem => lineItem !== null)
    ? lineItems
    : null;
}

export function readQuotePdfSnapshot(snapshot: JsonValue): QuotePdfSnapshotData | null {
  if (!isSnapshotRecord(snapshot)) {
    return null;
  }

  if (typeof snapshot.total_value !== "number" || !Array.isArray(snapshot.line_items)) {
    return null;
  }

  const lineItems = readSnapshotLineItems(snapshot.line_items);

  if (!lineItems) {
    return null;
  }

  return {
    quote: {
      number: typeof snapshot.number === "string" ? snapshot.number : null,
      currency: typeof snapshot.currency === "string" ? snapshot.currency : "HKD",
      total_value: snapshot.total_value,
      valid_until: typeof snapshot.valid_until === "string" ? snapshot.valid_until : null,
      cover_text: typeof snapshot.cover_text === "string" ? snapshot.cover_text : null,
      assumptions: typeof snapshot.assumptions === "string" ? snapshot.assumptions : null,
      payment_terms: typeof snapshot.payment_terms === "string" ? snapshot.payment_terms : null,
      document_sections: snapshot.document_sections ?? [],
    },
    lineItems,
  };
}

export function resolveQuotePdfSource(
  quote: QuotePdfSourceInput,
  versions: QuoteVersion[],
): ResolvedQuotePdfSource {
  const immutableReference =
    quote.status === "accepted" && quote.accepted_version_id
      ? { versionId: quote.accepted_version_id, versionReason: "accepted" as const }
      : (quote.status === "sent" || quote.status === "viewed") && quote.issued_version_id
        ? { versionId: quote.issued_version_id, versionReason: "issued" as const }
        : null;

  if (!immutableReference) {
    return {
      state: "live",
      quote,
      lineItems: quote.line_items,
      sourceVersion: null,
      error: null,
    };
  }

  const sourceVersion =
    versions.find((version) => version.id === immutableReference.versionId) ?? null;

  if (!sourceVersion) {
    return {
      state: "invalid",
      quote: null,
      lineItems: [],
      sourceVersion: null,
      error: {
        code: "missing_immutable_snapshot",
        versionId: immutableReference.versionId,
        versionReason: immutableReference.versionReason,
      },
    };
  }

  const snapshot = readQuotePdfSnapshot(sourceVersion.snapshot);

  if (!snapshot) {
    return {
      state: "invalid",
      quote: null,
      lineItems: [],
      sourceVersion,
      error: {
        code: "invalid_immutable_snapshot",
        versionId: sourceVersion.id,
        versionReason: immutableReference.versionReason,
      },
    };
  }

  return {
    state: "snapshot",
    quote: snapshot.quote,
    lineItems: snapshot.lineItems,
    sourceVersion,
    error: null,
  };
}
