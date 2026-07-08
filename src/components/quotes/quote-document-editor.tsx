import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { JsonValue } from "@/lib/types";

export type QuoteDocumentDraft = {
  cover_text: string;
  assumptions: string;
  payment_terms: string;
  document_sections: JsonValue;
};

type QuoteDocumentEditorProps = {
  value: QuoteDocumentDraft;
  onChange: (value: QuoteDocumentDraft) => void;
};

export function QuoteDocumentEditor({ value, onChange }: QuoteDocumentEditorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="quote-cover-text">Cover text</Label>
        <Textarea
          id="quote-cover-text"
          name="quote-cover-text"
          value={value.cover_text}
          onChange={(event) => onChange({ ...value, cover_text: event.target.value })}
          className="min-h-[120px]"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="quote-assumptions">Assumptions</Label>
        <Textarea
          id="quote-assumptions"
          name="quote-assumptions"
          value={value.assumptions}
          onChange={(event) => onChange({ ...value, assumptions: event.target.value })}
          className="min-h-[100px]"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="quote-payment-terms">Payment terms</Label>
        <Textarea
          id="quote-payment-terms"
          name="quote-payment-terms"
          value={value.payment_terms}
          onChange={(event) => onChange({ ...value, payment_terms: event.target.value })}
          className="min-h-[100px]"
        />
      </div>
    </div>
  );
}
