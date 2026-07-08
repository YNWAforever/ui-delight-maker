import { formatCurrencyAmount, formatDate } from "@/lib/format";
import type { JsonValue, Quote, QuoteLineItem, QuoteVersion } from "@/lib/types";
import { normalizeQuoteDocumentSections } from "@/components/quotes/quote-document-editor";

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
  Pick<Quote, "accepted_version_id" | "issued_version_id" | "line_items">;

type ResolvedQuotePdfSource = {
  quote: QuotePdfQuote;
  lineItems: QuoteLineItem[];
  sourceVersion: QuoteVersion | null;
};

type QuotePdfPreviewProps = {
  quote: QuotePdfQuote;
  lineItems: QuoteLineItem[];
  clientName: string;
};

function isSnapshotRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSnapshotLineItems(value: JsonValue): QuoteLineItem[] {
  return Array.isArray(value) ? (value as QuoteLineItem[]) : [];
}

function getVersionByReasonOrId(
  versions: QuoteVersion[],
  id: string | null,
  reason: QuoteVersion["reason"],
): QuoteVersion | null {
  if (id) {
    const matchingById = versions.find((version) => version.id === id);
    if (matchingById) {
      return matchingById;
    }
  }

  return versions.find((version) => version.reason === reason) ?? null;
}

export function readQuotePdfSnapshot(snapshot: JsonValue): Omit<ResolvedQuotePdfSource, "sourceVersion"> | null {
  if (!isSnapshotRecord(snapshot)) {
    return null;
  }

  return {
    quote: {
      number: typeof snapshot.number === "string" ? snapshot.number : null,
      currency: typeof snapshot.currency === "string" ? snapshot.currency : "HKD",
      total_value: typeof snapshot.total_value === "number" ? snapshot.total_value : 0,
      valid_until: typeof snapshot.valid_until === "string" ? snapshot.valid_until : null,
      cover_text: typeof snapshot.cover_text === "string" ? snapshot.cover_text : null,
      assumptions: typeof snapshot.assumptions === "string" ? snapshot.assumptions : null,
      payment_terms: typeof snapshot.payment_terms === "string" ? snapshot.payment_terms : null,
      document_sections: snapshot.document_sections ?? [],
    },
    lineItems: readSnapshotLineItems(snapshot.line_items),
  };
}

export function resolveQuotePdfSource(
  quote: QuotePdfSourceInput,
  versions: QuoteVersion[],
): ResolvedQuotePdfSource {
  const sourceVersion =
    getVersionByReasonOrId(versions, quote.accepted_version_id, "accepted") ??
    getVersionByReasonOrId(versions, quote.issued_version_id, "issued");

  if (!sourceVersion) {
    return {
      quote,
      lineItems: quote.line_items,
      sourceVersion: null,
    };
  }

  const snapshot = readQuotePdfSnapshot(sourceVersion.snapshot);

  if (!snapshot) {
    return {
      quote,
      lineItems: quote.line_items,
      sourceVersion: null,
    };
  }

  return {
    ...snapshot,
    sourceVersion,
  };
}

export function QuotePdfPreview({ quote, lineItems, clientName }: QuotePdfPreviewProps) {
  const sections = normalizeQuoteDocumentSections(quote.document_sections).filter(
    (section) => section.visible && [section.title, section.label, section.body].some((value) => value.trim().length > 0),
  );

  return (
    <article className="mx-auto max-w-3xl bg-white p-8 text-slate-950 print:max-w-none print:p-0">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-sm font-semibold text-blue-600">Fimmick</p>
        <h1 className="mt-2 text-2xl font-semibold">Quote {quote.number ?? ""}</h1>
        <p className="mt-1 text-sm text-slate-600">{clientName}</p>
        <p className="mt-1 text-sm text-slate-600">Valid until {formatDate(quote.valid_until)}</p>
      </header>

      {quote.cover_text && <section className="mt-6 whitespace-pre-wrap text-sm">{quote.cover_text}</section>}

      {sections.map((section, index) => (
        <section key={`${section.title}-${index}`} className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {section.title || section.label || `Section ${index + 1}`}
          </h2>
          {section.label && section.label !== section.title ? (
            <p className="mt-1 text-xs font-medium text-slate-600">{section.label}</p>
          ) : null}
          {section.body ? <p className="mt-2 whitespace-pre-wrap text-sm">{section.body}</p> : null}
        </section>
      ))}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Commercials</h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="py-2">Service</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-2">
                  <div className="font-medium">{item.service}</div>
                  <div className="text-xs text-slate-500">{item.description}</div>
                </td>
                <td className="py-2 text-right">{item.qty}</td>
                <td className="py-2 text-right">{formatCurrencyAmount(item.unit_price, quote.currency)}</td>
                <td className="py-2 text-right">
                  {formatCurrencyAmount(item.qty * item.unit_price, quote.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 text-right text-base font-semibold">
          Total {formatCurrencyAmount(quote.total_value, quote.currency)}
        </div>
      </section>

      {quote.assumptions && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Assumptions</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{quote.assumptions}</p>
        </section>
      )}

      {quote.payment_terms && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Payment Terms</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{quote.payment_terms}</p>
        </section>
      )}
    </article>
  );
}
