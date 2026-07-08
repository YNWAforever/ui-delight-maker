import { createFileRoute } from "@tanstack/react-router";

import { QuotePdfPreview } from "@/components/quotes/quote-pdf-preview";
import { Button } from "@/components/ui/button";
import { getQuote } from "@/server-functions/quotes";

export const Route = createFileRoute("/quotes/$id/pdf")({
  loader: ({ params }) => getQuote({ data: { id: params.id } }),
  head: () => ({
    meta: [{ title: "Quote PDF - Fimmick ClientOps" }],
  }),
  component: QuotePdfRoute,
});

function QuotePdfRoute() {
  const quote = Route.useLoaderData();

  return (
    <main className="min-h-screen bg-white print:bg-white">
      <div className="p-4 text-right print:hidden">
        <Button type="button" onClick={() => window.print()}>
          Print or save PDF
        </Button>
      </div>
      <QuotePdfPreview
        quote={quote}
        lineItems={quote.line_items}
        clientName={quote.client_id ?? quote.lead_id ?? "Client"}
      />
    </main>
  );
}
