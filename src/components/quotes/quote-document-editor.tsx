import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createEmptyQuoteDocumentSection,
  normalizeQuoteDocumentSections,
  type QuoteDocumentDraft,
  type QuoteDocumentSection,
} from "@/lib/quote-document";

type QuoteDocumentEditorProps = {
  value: QuoteDocumentDraft;
  onChange: (value: QuoteDocumentDraft) => void;
};

const EMPTY_SECTION = createEmptyQuoteDocumentSection();

export function QuoteDocumentEditor({ value, onChange }: QuoteDocumentEditorProps) {
  const sections = normalizeQuoteDocumentSections(value.document_sections);

  const updateSections = (nextSections: QuoteDocumentSection[]) =>
    onChange({ ...value, document_sections: nextSections });

  const updateSection = (index: number, patch: Partial<QuoteDocumentSection>) =>
    updateSections(
      sections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section,
      ),
    );

  const moveSection = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sections.length) {
      return;
    }

    const nextSections = [...sections];
    const [section] = nextSections.splice(index, 1);
    nextSections.splice(nextIndex, 0, section);
    updateSections(nextSections);
  };

  const addSection = () => updateSections([...sections, { ...EMPTY_SECTION }]);

  const removeSection = (index: number) =>
    updateSections(sections.filter((_, sectionIndex) => sectionIndex !== index));

  return (
    <div className="space-y-6">
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
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm">Document sections</Label>
            <p className="text-xs text-muted-foreground">
              Add the scope and supporting sections that should appear in the PDF.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addSection}>
            <Plus aria-hidden="true" className="mr-2 h-4 w-4" /> Section
          </Button>
        </div>
        {sections.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No document sections yet.
          </div>
        ) : (
          <div className="space-y-3">
            {sections.map((section, index) => (
              <div
                key={`quote-section-${index}`}
                className="space-y-3 rounded-md border border-border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Section {index + 1}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        id={`quote-section-visible-${index}`}
                        checked={section.visible}
                        onCheckedChange={(checked) => updateSection(index, { visible: checked })}
                      />
                      <Label htmlFor={`quote-section-visible-${index}`}>Visible</Label>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => moveSection(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move section ${index + 1} up`}
                    >
                      <ArrowUp aria-hidden="true" className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => moveSection(index, 1)}
                      disabled={index === sections.length - 1}
                      aria-label={`Move section ${index + 1} down`}
                    >
                      <ArrowDown aria-hidden="true" className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeSection(index)}
                      aria-label={`Remove section ${index + 1}`}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`quote-section-title-${index}`}>Title</Label>
                    <Input
                      id={`quote-section-title-${index}`}
                      value={section.title}
                      onChange={(event) => updateSection(index, { title: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`quote-section-label-${index}`}>Label</Label>
                    <Input
                      id={`quote-section-label-${index}`}
                      value={section.label}
                      onChange={(event) => updateSection(index, { label: event.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`quote-section-body-${index}`}>Body</Label>
                  <Textarea
                    id={`quote-section-body-${index}`}
                    value={section.body}
                    onChange={(event) => updateSection(index, { body: event.target.value })}
                    className="min-h-[120px]"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
