import { createFileRoute } from "@tanstack/react-router";

import {
  QuotePdfPreview,
  QuotePdfPreviewUnavailable,
  resolveQuotePdfSource,
} from "@/components/quotes/quote-pdf-preview";
import { Button } from "@/components/ui/button";
import { getQuoteDocumentRead } from "@/server-functions/quote-workspace";

export const Route = createFileRoute("/quotes/$id_/pdf")({
  loader: ({ params }) => getQuoteDocumentRead({ data: { id: params.id } }),
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
        <QuotePdfPreview
          quote={previewSource.quote}
          lineItems={previewSource.lineItems}
          clientName={clientName}
        />
      )}
    </main>
  );
}
