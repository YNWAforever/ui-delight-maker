import { formatCurrencyAmount } from "@/lib/format";
import type { QuoteLineItem } from "@/lib/types";

type QuoteLineItemsViewProps = {
  items: readonly QuoteLineItem[];
  currency: string | null | undefined;
  /** The quote's stored total, shown as is rather than re-summed here. */
  total: number | string | null | undefined;
};

const MONEY_CLASS = "whitespace-nowrap tabular-nums";

/**
 * A quote's line items, read-only.
 *
 * On a phone the table kept only "Service" and the money scrolled out of a 560 px table; on a
 * tablet "Unit" read "U" and the totals were cut off (audit UX-13). Below `md` each line is a
 * short block — service, then quantity × unit price and the line total on one row — with the
 * quote total always visible beneath. From `md` it is the table. Only one of the two is
 * displayed, so assistive technology meets the line items once.
 */
export function QuoteLineItemsView({ items, currency, total }: QuoteLineItemsViewProps) {
  const money = (value: number | string | null | undefined) =>
    formatCurrencyAmount(value, currency);

  return (
    <>
      <div className="md:hidden">
        <ul aria-label="Line items" className="divide-y divide-border text-sm">
          {items.map((item) => (
            <li key={item.id} className="py-3">
              <p className="font-medium text-pretty">{item.service}</p>
              {item.description ? (
                <p className="text-xs text-muted-foreground text-pretty">{item.description}</p>
              ) : null}
              <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className={`text-muted-foreground ${MONEY_CLASS}`}>
                  {item.qty} × {money(item.unit_price)}
                </span>
                <span className={`font-medium ${MONEY_CLASS}`}>
                  {money(item.qty * item.unit_price)}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between gap-3 border-t border-border py-3">
          <span className="text-sm font-semibold">Total</span>
          <span className={`text-base font-semibold ${MONEY_CLASS}`}>{money(total)}</span>
        </div>
      </div>

      <div className="hidden max-w-full overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-4 text-left font-medium">
                Service
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                Qty
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium whitespace-nowrap">
                Unit price
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="py-3 pr-4">
                  <div className="font-medium">{item.service}</div>
                  {item.description ? (
                    <div className="text-xs text-muted-foreground">{item.description}</div>
                  ) : null}
                </td>
                <td className={`py-3 pl-4 text-right ${MONEY_CLASS}`}>{item.qty}</td>
                <td className={`py-3 pl-4 text-right ${MONEY_CLASS}`}>{money(item.unit_price)}</td>
                <td className={`py-3 pl-4 text-right font-medium ${MONEY_CLASS}`}>
                  {money(item.qty * item.unit_price)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <th scope="row" colSpan={3} className="py-3 text-right text-sm font-semibold">
                Total
              </th>
              <td className={`py-3 pl-4 text-right text-base font-semibold ${MONEY_CLASS}`}>
                {money(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
