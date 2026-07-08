import { createFileRoute } from "@tanstack/react-router";

import {
  QuotePdfPreview,
  QuotePdfPreviewUnavailable,
  resolveQuotePdfSource,
} from "@/components/quotes/quote-pdf-preview";
import { Button } from "@/components/ui/button";
import { getClient } from "@/server-functions/clients";
import { getLead } from "@/server-functions/leads";
import { getQuote, getQuoteVersions } from "@/server-functions/quotes";

export const Route = createFileRoute("/quotes/$id/pdf")({
  loader: async ({ params }) => {
    const quote = await getQuote({ data: { id: params.id } });
    const [versions, client, leadResult] = await Promise.all([
      getQuoteVersions({ data: { quoteId: quote.id } }),
      quote.client_id ? getClient({ data: { id: quote.client_id } }) : Promise.resolve(null),
      quote.lead_id ? getLead({ data: { id: quote.lead_id } }) : Promise.resolve(null),
    ]);

    return {
      quote,
      versions,
      client,
      lead: leadResult?.lead ?? null,
    };
  },
  head: () => ({
    meta: [{ title: "Quote PDF - Fimmick ClientOps" }],
  }),
  component: QuotePdfRoute,
});

function QuotePdfRoute() {
  const { quote, versions, client, lead } = Route.useLoaderData();
  const previewSource = resolveQuotePdfSource(quote, versions);
  const clientName =
    client?.company_name ?? lead?.company_name ?? quote.client_id ?? quote.lead_id ?? "Client";

  return (
    <main className="min-h-screen bg-white print:bg-white">
      <div className="p-4 text-right print:hidden">
        <Button type="button" onClick={() => window.print()}>
          Print or save PDF
        </Button>
      </div>
      {previewSource.state === "invalid" ? (
        <div className="mx-auto max-w-3xl px-4 pb-8">
          <QuotePdfPreviewUnavailable error={previewSource.error} />
        </div>
      ) : (
        <QuotePdfPreview quote={previewSource.quote} lineItems={previewSource.lineItems} clientName={clientName} />
      )}
    </main>
  );
}
