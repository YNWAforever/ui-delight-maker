import { formatCurrencyAmount, formatDate } from "@/lib/format";
import type { Quote, QuoteLineItem } from "@/lib/types";

type QuotePdfPreviewProps = {
  quote: Pick<
    Quote,
    "number" | "currency" | "total_value" | "valid_until" | "cover_text" | "assumptions" | "payment_terms"
  >;
  lineItems: QuoteLineItem[];
  clientName: string;
};

export function QuotePdfPreview({ quote, lineItems, clientName }: QuotePdfPreviewProps) {
  return (
    <article className="mx-auto max-w-3xl bg-white p-8 text-slate-950 print:max-w-none print:p-0">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-sm font-semibold text-blue-600">Fimmick</p>
        <h1 className="mt-2 text-2xl font-semibold">Quote {quote.number ?? ""}</h1>
        <p className="mt-1 text-sm text-slate-600">{clientName}</p>
        <p className="mt-1 text-sm text-slate-600">Valid until {formatDate(quote.valid_until)}</p>
      </header>

      {quote.cover_text && <section className="mt-6 whitespace-pre-wrap text-sm">{quote.cover_text}</section>}

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
