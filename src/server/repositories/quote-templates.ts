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

export async function listRecentQuoteTemplates(limit = 10): Promise<QuoteTemplate[]> {
  const boundedLimit = Math.min(10, Math.max(1, Math.trunc(limit)));
  return query<QuoteTemplate>(
    `
      select
        qt.id, qt.name, qt.description, qt.active, qt.default_cover_text,
        qt.default_scope_sections, qt.default_assumptions, qt.default_payment_terms,
        qt.default_validity_days, qt.starter_line_items, qt.default_pdf_template_id,
        qt.created_by, qt.created_at, qt.updated_at
      from quote_templates qt
      left join quotes q on q.quote_template_id = qt.id
      where qt.active = true
      group by qt.id
      order by max(q.created_at) desc nulls last, qt.name asc, qt.id asc
      limit $1
    `,
    [boundedLimit],
  );
}

export async function listCompactQuotePdfTemplates(limit = 10): Promise<PdfTemplate[]> {
  const boundedLimit = Math.min(10, Math.max(1, Math.trunc(limit)));
  return query<PdfTemplate>(
    `
      select id, name, document_type, active, brand_settings, sections,
             created_by, created_at, updated_at
      from pdf_templates
      where active = true and document_type = 'quote'
      order by name asc, id asc
      limit $1
    `,
    [boundedLimit],
  );
}
