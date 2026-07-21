import { QuoteDocumentEditor } from "@/components/quotes/quote-document-editor";
import {
  QuotePdfPreview,
  QuotePdfPreviewUnavailable,
  resolveQuotePdfSource,
} from "@/components/quotes/quote-pdf-preview";
import type { QuoteDocumentDraft } from "@/lib/quote-document";
import type { QuoteVersion } from "@/lib/types";

type QuoteDocumentToolsProps = {
  value: QuoteDocumentDraft;
  onChange: (value: QuoteDocumentDraft) => void;
};

export function QuoteDocumentTools({ value, onChange }: QuoteDocumentToolsProps) {
  return <QuoteDocumentEditor value={value} onChange={onChange} />;
}

type QuoteDocumentPreviewProps = {
  quote: Parameters<typeof resolveQuotePdfSource>[0];
  versions: QuoteVersion[];
  clientName: string;
};

export function QuoteDocumentPreview({ quote, versions, clientName }: QuoteDocumentPreviewProps) {
  const source = resolveQuotePdfSource(quote, versions);
  if (source.state === "invalid") {
    return <QuotePdfPreviewUnavailable error={source.error} />;
  }

  return (
    <QuotePdfPreview quote={source.quote} lineItems={source.lineItems} clientName={clientName} />
  );
}
