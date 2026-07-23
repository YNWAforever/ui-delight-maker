import type { JsonValue } from "@/lib/types";

export type QuoteDocumentDraft = {
  cover_text: string;
  assumptions: string;
  payment_terms: string;
  document_sections: JsonValue;
};

export type QuoteDocumentSection = {
  title: string;
  label: string;
  body: string;
  visible: boolean;
};

const EMPTY_SECTION: QuoteDocumentSection = {
  title: "",
  label: "",
  body: "",
  visible: true,
};

export function createEmptyQuoteDocumentSection(): QuoteDocumentSection {
  return { ...EMPTY_SECTION };
}

export function normalizeQuoteDocumentSections(value: JsonValue): QuoteDocumentSection[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      return [{ ...EMPTY_SECTION, title: entry }];
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];

    const record = entry as Record<string, unknown>;
    return [
      {
        title:
          typeof record.title === "string"
            ? record.title
            : typeof record.heading === "string"
              ? record.heading
              : "",
        label: typeof record.label === "string" ? record.label : "",
        body:
          typeof record.body === "string"
            ? record.body
            : typeof record.content === "string"
              ? record.content
              : "",
        visible: typeof record.visible === "boolean" ? record.visible : true,
      },
    ];
  });
}
