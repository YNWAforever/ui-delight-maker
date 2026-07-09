import type { PdfDocumentType, PdfTemplate, QuoteTemplate } from "@/lib/types";
import { query } from "@/server/db/neon.server";

export async function listQuoteTemplates(): Promise<QuoteTemplate[]> {
  return query<QuoteTemplate>(
    `
      select *
      from quote_templates
      where active = true
      order by name
    `,
  );
}

export async function listPdfTemplates(documentType?: PdfDocumentType): Promise<PdfTemplate[]> {
  if (documentType) {
    return query<PdfTemplate>(
      `
        select *
        from pdf_templates
        where active = true
          and document_type = $1
        order by name
      `,
      [documentType],
    );
  }

  return query<PdfTemplate>(
    `
      select *
      from pdf_templates
      where active = true
      order by document_type, name
    `,
  );
}
