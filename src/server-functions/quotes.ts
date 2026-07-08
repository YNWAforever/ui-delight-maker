import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { getN8nDispatchConfig, triggerN8n } from "@/lib/n8n";
import { buildQuoteDraftPayload } from "@/lib/workflows/payloads";
import { createJobSheetFromAcceptedQuote } from "@/server/repositories/job-sheets";
import { listPdfTemplates, listQuoteTemplates } from "@/server/repositories/quote-templates";
import { createQuoteVersion, listQuoteVersions } from "@/server/repositories/quote-versions";
import {
  createAgentRun,
  findActiveRun,
  updateAgentRunResult,
} from "@/server/repositories/agent-runs";
import {
  createQuote as createQuoteInNeon,
  getQuote as getQuoteFromNeon,
  listActivePricingTemplates,
  listQuotes,
  updateQuote as updateQuoteInNeon,
} from "@/server/repositories/quotes";
import { serializeAgentRun } from "@/server-functions/serializers";
import type { JsonValue, PricingTemplate, Quote, QuoteVersion } from "@/lib/types";

type GetQuotesInput = {
  status?: string;
  lead_id?: string;
  client_id?: string;
  contact_id?: string;
  account_id?: string;
  deal_id?: string;
};

export type CreateQuoteInput = Pick<Quote, "lead_id" | "currency"> &
  Partial<
    Pick<
      Quote,
      | "client_id"
      | "contact_id"
      | "account_id"
      | "deal_id"
      | "line_items"
      | "total_value"
      | "valid_until"
      | "number"
      | "quote_template_id"
      | "document_sections"
      | "cover_text"
      | "assumptions"
      | "payment_terms"
    >
  >;

export const getQuotes = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetQuotesInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return listQuotes(data);
  });

export const getQuote = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return getQuoteFromNeon(data.id);
  });

export const createQuote = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateQuoteInput)
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    return createQuoteInNeon({ ...data, created_by: session.user.id });
  });

export const updateQuote = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Quote> })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return updateQuoteInNeon(data.id, data.updates);
  });

export const requestQuoteApproval = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return updateQuoteInNeon(data.id, { status: "pending_approval" });
  });

export const triggerQuoteAgent = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { leadId: string })
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const existingRun = await findActiveRun(data.leadId, "draft_quote");
    if (existingRun) {
      return {
        triggered: false,
        run: serializeAgentRun(existingRun),
        reason: "already_running" as const,
      };
    }

    const dispatchConfig = getN8nDispatchConfig(process.env.N8N_DRAFT_QUOTE_WEBHOOK_URL);
    if (!dispatchConfig) {
      return {
        triggered: false,
        reason: "missing_webhook" as const,
      };
    }

    const { run, created } = await createAgentRun({
      agent_name: "Quote Draft Agent",
      workflow_type: "draft_quote",
      subject_id: data.leadId,
      input_data: { lead_id: data.leadId },
      created_by: session.user.id,
    });

    if (!created) {
      return {
        triggered: false,
        run: serializeAgentRun(run),
        reason: "already_running" as const,
      };
    }

    try {
      await triggerN8n(
        dispatchConfig,
        buildQuoteDraftPayload({ leadId: data.leadId, agentRunId: run.id }),
      );
    } catch (error) {
      await updateAgentRunResult(run.id, {
        status: "failed",
        output_data: {
          dispatch_error: error instanceof Error ? error.message : "Unknown n8n dispatch error",
        },
        output_summary: "Failed to dispatch quote draft workflow.",
      });
      throw error;
    }

    return { triggered: true, run: serializeAgentRun(run) };
  });

export const getPricingTemplates = createServerFn({ method: "GET" }).handler(async () => {
  await requireNeonAuthSession();
  return listActivePricingTemplates() as Promise<PricingTemplate[]>;
});

export const getQuoteTemplates = createServerFn({ method: "GET" }).handler(async () => {
  await requireNeonAuthSession();
  return listQuoteTemplates();
});

export const getQuotePdfTemplates = createServerFn({ method: "GET" }).handler(async () => {
  await requireNeonAuthSession();
  return listPdfTemplates("quote");
});

export const getQuoteVersions = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { quoteId: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return listQuoteVersions(data.quoteId);
  });

async function getExistingQuoteVersionOrThrow(quoteId: string, versionId: string): Promise<QuoteVersion> {
  const versions = await listQuoteVersions(quoteId);
  const version = versions.find((candidate) => candidate.id === versionId);

  if (!version) {
    throw new Error(`Quote version ${versionId} not found for quote ${quoteId}`);
  }

  return version;
}

async function findExistingQuoteVersionByReason(
  quoteId: string,
  reason: QuoteVersion["reason"],
): Promise<QuoteVersion | null> {
  const versions = await listQuoteVersions(quoteId);
  return versions.find((candidate) => candidate.reason === reason) ?? null;
}

export const issueQuoteVersion = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; pdfTemplateId?: string | null })
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const quote = await getQuoteFromNeon(data.id);
    const version = quote.issued_version_id
      ? await getExistingQuoteVersionOrThrow(quote.id, quote.issued_version_id)
      : ((await findExistingQuoteVersionByReason(quote.id, "issued")) ??
        (await createQuoteVersion({
          quote_id: quote.id,
          reason: "issued",
          snapshot: quote as unknown as JsonValue,
          pdf_template_id: data.pdfTemplateId ?? null,
          pdf_url: `/quotes/${quote.id}/pdf`,
          created_by: session.user.id,
        })));
    const needsIssueUpdate = quote.status !== "sent" || quote.pdf_url !== version.pdf_url;
    const updated =
      !quote.issued_version_id || needsIssueUpdate
        ? await updateQuoteInNeon(quote.id, {
            status: "sent",
            issued_version_id: quote.issued_version_id === version.id ? undefined : version.id,
            pdf_url: version.pdf_url,
          })
        : quote;

    return { quote: updated, version };
  });

export const acceptQuoteAndCreateJobSheet = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const quote = await getQuoteFromNeon(data.id);
    const version = quote.accepted_version_id
      ? await getExistingQuoteVersionOrThrow(quote.id, quote.accepted_version_id)
      : ((await findExistingQuoteVersionByReason(quote.id, "accepted")) ??
        (await createQuoteVersion({
          quote_id: quote.id,
          reason: "accepted",
          snapshot: quote as unknown as JsonValue,
          pdf_template_id: null,
          pdf_url: quote.pdf_url,
          created_by: session.user.id,
        })));
    const acceptedAt = quote.accepted_at ?? new Date().toISOString();
    const acceptedBy = quote.accepted_by ?? session.user.id;
    const needsAcceptanceUpdate =
      quote.status !== "accepted" ||
      quote.accepted_at !== acceptedAt ||
      quote.accepted_by !== acceptedBy;
    const updated =
      !quote.accepted_version_id || needsAcceptanceUpdate
        ? await updateQuoteInNeon(quote.id, {
            status: "accepted",
            accepted_version_id: quote.accepted_version_id === version.id ? undefined : version.id,
            accepted_at: acceptedAt,
            accepted_by: acceptedBy,
          })
        : quote;
    const jobSheet = await createJobSheetFromAcceptedQuote({
      quote_id: quote.id,
      accepted_quote_version_id: version.id,
      account_id: quote.account_id,
      client_id: quote.client_id,
      contact_id: quote.contact_id,
      sales_owner: quote.created_by,
      total_amount: quote.total_value ?? 0,
      currency: quote.currency,
      created_by: session.user.id,
    });

    return { quote: updated, jobSheet };
  });
