import type { QuoteStatus } from "@/lib/types";
import { readQuotePdfSnapshot } from "@/lib/quote-pdf-source";
import { query, type Queryable } from "@/server/db/neon.server";

export type QuoteIntegrityIssue =
  | "missing_version_reference"
  | "wrong_quote_version"
  | "wrong_version_reason"
  | "malformed_snapshot"
  | "identity_unverified"
  | "identity_drift"
  | "commercial_drift";

export type QuoteIntegrityFinding = {
  quoteId: string;
  status: QuoteStatus;
  versionId: string | null;
  issues: QuoteIntegrityIssue[];
};

type IntegrityRow = {
  id: string;
  status: QuoteStatus;
  version_id: string | null;
  version_quote_id: string | null;
  version_reason: string | null;
  snapshot: unknown;
  total_value: string | number | null;
  currency: string;
  line_items: unknown;
  cover_text: string | null;
  assumptions: string | null;
  payment_terms: string | null;
  document_sections: unknown;
  lead_id: string | null;
  client_id: string | null;
  contact_id: string | null;
  account_id: string | null;
  deal_id: string | null;
};

/** Read-only, bounded reconciliation. Never guesses a repair for a historical quote. */
export async function inspectQuoteIntegrity(
  input: { afterId?: string; limit?: number; ids?: string[] } = {},
  db?: Queryable,
): Promise<{ findings: QuoteIntegrityFinding[]; scanned: number; nextCursor: string | null }> {
  const limit = Math.min(500, Math.max(1, Math.trunc(input.limit ?? 100)));
  const rows = await query<IntegrityRow>(
    `select q.id,q.status,q.total_value,q.currency,q.line_items,q.cover_text,
            q.assumptions,q.payment_terms,q.document_sections,q.lead_id,q.client_id,
            q.contact_id,q.account_id,q.deal_id,v.id as version_id,
            v.quote_id as version_quote_id,v.reason as version_reason,v.snapshot
     from quotes q left join quote_versions v on v.id =
       case when q.status='accepted' then q.accepted_version_id else q.issued_version_id end
     where q.status in ('sent','viewed','accepted')
       and ($1::uuid is null or q.id>$1::uuid)
       and ($2::uuid[] is null or q.id=any($2::uuid[]))
     order by q.id limit $3`,
    [input.afterId ?? null, input.ids ?? null, limit + 1],
    db,
  );
  const page = rows.slice(0, limit);
  const findings: QuoteIntegrityFinding[] = [];
  for (const row of page) {
    const issues: QuoteIntegrityIssue[] = [];
    if (!row.version_id) {
      issues.push("missing_version_reference");
    } else if (row.version_quote_id !== row.id) {
      issues.push("wrong_quote_version");
    } else {
      const expectedReason = row.status === "accepted" ? "accepted" : "issued";
      if (row.version_reason !== expectedReason) issues.push("wrong_version_reason");
      const snapshot = readQuotePdfSnapshot(
        row.snapshot as Parameters<typeof readQuotePdfSnapshot>[0],
      );
      const raw = row.snapshot;
      if (!snapshot || !raw || typeof raw !== "object" || Array.isArray(raw)) {
        issues.push("malformed_snapshot");
      } else {
        const record = raw as Record<string, unknown>;
        const identityFields = [
          "lead_id",
          "client_id",
          "contact_id",
          "account_id",
          "deal_id",
        ] as const;
        if (identityFields.some((field) => !(field in record))) {
          issues.push("identity_unverified");
        } else if (identityFields.some((field) => record[field] !== row[field])) {
          issues.push("identity_drift");
        }
        if (
          record.id !== row.id ||
          snapshot.quote.total_value !== Number(row.total_value) ||
          snapshot.quote.currency !== row.currency ||
          snapshot.quote.cover_text !== row.cover_text ||
          snapshot.quote.assumptions !== row.assumptions ||
          snapshot.quote.payment_terms !== row.payment_terms ||
          JSON.stringify(record.line_items) !== JSON.stringify(row.line_items) ||
          JSON.stringify(record.document_sections ?? []) !==
            JSON.stringify(row.document_sections ?? [])
        ) {
          issues.push("commercial_drift");
        }
      }
    }
    if (issues.length > 0) {
      findings.push({ quoteId: row.id, status: row.status, versionId: row.version_id, issues });
    }
  }
  return {
    findings,
    scanned: page.length,
    nextCursor: rows.length > limit ? page.at(-1)!.id : null,
  };
}
