import { formatCurrencyAmount, formatDate } from "@/lib/format";
import { normalizeQuoteDocumentSections } from "@/lib/quote-document";
import type { QuotePdfQuote, QuotePdfSourceError } from "@/lib/quote-pdf-source";
import type { QuoteLineItem } from "@/lib/types";

type QuotePdfPreviewProps = {
  quote: QuotePdfQuote;
  lineItems: QuoteLineItem[];
  clientName: string;
};

type QuotePdfPreviewUnavailableProps = {
  error: QuotePdfSourceError;
};

export function QuotePdfPreviewUnavailable({ error }: QuotePdfPreviewUnavailableProps) {
  const versionLabel = error.versionReason === "accepted" ? "accepted" : "issued";
  const detail =
    error.code === "missing_immutable_snapshot"
      ? "The referenced snapshot could not be found."
      : "The referenced snapshot is malformed.";

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-medium">PDF preview unavailable</p>
      <p className="mt-1">
        This quote points to an immutable {versionLabel} snapshot, but {detail} Repair the snapshot
        reference before rendering a PDF preview.
      </p>
      <p className="mt-2 text-xs text-amber-800">Snapshot id: {error.versionId}</p>
    </div>
  );
}

export function QuotePdfPreview({ quote, lineItems, clientName }: QuotePdfPreviewProps) {
  const sections = normalizeQuoteDocumentSections(quote.document_sections).filter(
    (section) =>
      section.visible &&
      [section.title, section.label, section.body].some((value) => value.trim().length > 0),
  );

  return (
    <article className="mx-auto max-w-3xl bg-white p-8 text-slate-950 print:max-w-none print:p-0">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-sm font-semibold text-blue-600">Fimmick</p>
        <h1 className="mt-2 text-2xl font-semibold">Quote {quote.number ?? ""}</h1>
        <p className="mt-1 text-sm text-slate-600">{clientName}</p>
        <p className="mt-1 text-sm text-slate-600">Valid until {formatDate(quote.valid_until)}</p>
      </header>

      {quote.cover_text && (
        <section className="mt-6 whitespace-pre-wrap text-sm">{quote.cover_text}</section>
      )}

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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Commercials
        </h2>
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
                <td className="py-2 text-right">
                  {formatCurrencyAmount(item.unit_price, quote.currency)}
                </td>
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Assumptions
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{quote.assumptions}</p>
        </section>
      )}

      {quote.payment_terms && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Payment Terms
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{quote.payment_terms}</p>
        </section>
      )}
    </article>
  );
}
