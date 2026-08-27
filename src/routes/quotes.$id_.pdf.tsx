import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Printer } from "lucide-react";

import { QuotePdfPreview, QuotePdfPreviewUnavailable } from "@/components/quotes/quote-pdf-preview";
import { ErrorState } from "@/components/sales";
import { resolveQuotePdfSource } from "@/lib/quote-pdf-source";
import { Button } from "@/components/ui/button";
import { getQuoteDocumentRead } from "@/server-functions/quote-workspace";

export const Route = createFileRoute("/quotes/$id_/pdf")({
  loader: ({ params }) => getQuoteDocumentRead({ data: { id: params.id } }),
  head: () => ({
    meta: [{ title: "Quote PDF - Fimmick ClientOps" }],
  }),
  errorComponent: QuotePdfError,
  component: QuotePdfRoute,
});

/**
 * IF-C2-35: without this the root boundary prints the thrown message — including
 * "Immutable quote snapshot is missing or malformed" and any Neon driver text — into the
 * page body.
 */
function QuotePdfError({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="This quote document could not be loaded"
        retryLabel="Reload document"
        onRetry={() => {
          reset();
          void router.invalidate({ filter: (match) => match.routeId === "/quotes/$id_/pdf" });
        }}
      />
    </div>
  );
}

function QuotePdfRoute() {
  const { quote, versions, client, lead } = Route.useLoaderData();
  const previewSource = resolveQuotePdfSource(quote, versions);
  const clientName =
    client?.company_name ?? lead?.company_name ?? quote.client_id ?? quote.lead_id ?? "Client";

  return (
    /*
     * IF-C2-33: a `div`, not a `main`. This route renders inside the root shell's
     * `<main id="main-content">`, and a second `main` landmark breaks both the skip link
     * and screen-reader landmark navigation.
     *
     * `data-print-document` is the hook the print rules in src/styles.css use to drop the
     * sidebar, the sticky app header and the toaster from the printed sheet (IF-C2-32).
     */
    <div data-print-document className="min-h-screen bg-white">
      {/* IF-C2-34: this route had no way back. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 print:hidden">
        <Link
          to="/quotes/$id"
          params={{ id: quote.id }}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          Back to quote {quote.number ?? ""}
        </Link>
        <div className="flex items-center gap-3">
          {/*
           * IF-C2-31, frontend half: this is a print view, not a stored artifact. No server
           * function generates a PDF file anywhere, so the copy says what the control does
           * — open the browser's print dialog — rather than promising a document download.
           */}
          <p className="text-xs text-slate-500">
            Print, or choose “Save as PDF” in the print dialog.
          </p>
          <Button type="button" onClick={() => window.print()}>
            <Printer aria-hidden="true" className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
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
    </div>
  );
}
