import { resolveDispatchableAgent } from "@/lib/agents";
import { requireCapability, requireCapabilitySet } from "@/server/auth/authorization.server";
import { loadAgentPolicies } from "@/server/repositories/agent-policy";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { getN8nDispatchConfig, triggerN8n } from "@/lib/n8n";
import { buildQuoteDraftPayload } from "@/lib/workflows/payloads";
import { createJobSheetFromAcceptedQuote } from "@/server/repositories/job-sheets";
import { listPdfTemplates, listQuoteTemplates } from "@/server/repositories/quote-templates";
import { createQuoteVersion, listQuoteVersions } from "@/server/repositories/quote-versions";
import {
  createApproval,
  decideApproval as decideApprovalInNeon,
  findPendingApprovalForQuote,
  getApproval as getApprovalFromNeon,
} from "@/server/repositories/approvals";
import {
  createAgentRun,
  findActiveRun,
  updateAgentRunResult,
} from "@/server/repositories/agent-runs";
import {
  createQuote as createQuoteInNeon,
  getQuote as getQuoteFromNeon,
  listActivePricingTemplates,
  listQuoteLineItems,
  listQuotes,
  listQuotesPage,
  type QuotePageFilters,
  updateQuoteLifecycle as updateQuoteLifecycleInNeon,
  updateQuote as updateQuoteInNeon,
} from "@/server/repositories/quotes";
import { serializeAgentRun, serializeHumanApproval } from "@/lib/serializable";
import { transaction } from "@/server/db/neon.server";
import type { HumanApproval, JsonValue, PricingTemplate, Quote, QuoteVersion } from "@/lib/types";

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

const lifecycleQuoteUpdateFields = new Set([
  "status",
  "accepted_version_id",
  "issued_version_id",
  "accepted_at",
  "accepted_by",
  "pdf_url",
  "approved_by",
]);

function assertNoLifecycleQuoteUpdates(updates: Partial<Quote>) {
  const lifecycleFields = Object.keys(updates).filter(
    (field) => updates[field as keyof Quote] !== undefined && lifecycleQuoteUpdateFields.has(field),
  );

  if (lifecycleFields.length > 0) {
    throw new Error("Quote lifecycle fields must be changed through workflow actions");
  }
}

export const getQuotes = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetQuotesInput)
  .handler(async ({ data }) => {
    await requireCapability("quotes.view");
    await requireNeonAuthSession();
    return listQuotes(data);
  });

export const getQuotesPage = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as QuotePageFilters & { search?: string })
  .handler(async ({ data }) => {
    // One authorization context load answers all three questions. The previous
    // `requireCapability` + `requireNeonAuthSession` pair was two loads, and
    // `requireCapabilitySet` already establishes the session.
    const access = await requireCapabilitySet(["quotes.view"], {
      optional: ["leads.view", "accounts.view"],
    });
    const visibility = {
      leads: access["leads.view"] === true,
      // `accounts.view` gates clients — the same capability the quote detail page uses for
      // its client check, so the list and the detail page agree by construction.
      clients: access["accounts.view"] === true,
    };

    const page = await listQuotesPage({ ...data, visibility });
    // Returned so the client can tell a redacted name from a genuinely absent one.
    return { ...page, visibility };
  });

export const getQuote = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireCapability("quotes.view", { resourceType: "quote", resourceId: data.id });
    await requireNeonAuthSession();
    return getQuoteFromNeon(data.id);
  });

export const createQuote = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateQuoteInput)
  .handler(async ({ data }) => {
    await requireCapability("quotes.create");
    const session = await requireNeonAuthSession();
    return createQuoteInNeon({ ...data, created_by: session.profile.id });
  });

export const updateQuote = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Quote> })
  .handler(async ({ data }) => {
    await requireCapability("quotes.update", { resourceType: "quote", resourceId: data.id });
    await requireNeonAuthSession();
    assertNoLifecycleQuoteUpdates(data.updates);
    return updateQuoteInNeon(data.id, data.updates);
  });

/**
 * Send a quote for approval, and put it in the approvals queue.
 *
 * This used to call `updateQuoteLifecycleInNeon` and nothing else, so a quote flipped itself to
 * `pending_approval` and never became a `human_approvals` row — /approvals never saw it, and
 * there was no approval for a reviewer to be assigned to (BD-10).
 *
 * The context carries the total and currency, the facts a reviewer needs to judge the request,
 * recorded as submitted rather than re-read at decision time. It deliberately carries no
 * discount: `quotes` has no discount column, and the composer at src/routes/quotes.new.tsx
 * applies the percentage into each line item's `unit_price` before saving, so nothing on a
 * stored quote can be turned back into one without guessing at list prices.
 */
export const requestQuoteApproval = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; assignedTo?: string | null })
  .handler(async ({ data }) => {
    await requireCapability("quotes.request_approval", {
      resourceType: "quote",
      resourceId: data.id,
    });
    const session = await requireNeonAuthSession();

    // Requesting twice must not queue twice: a reviewer would decide one and the other would
    // linger. Returning the existing approval makes re-requesting idempotent.
    const existing = await findPendingApprovalForQuote(data.id);
    if (existing) return serializeHumanApproval(existing);

    const quote = await getQuoteFromNeon(data.id);

    // One transaction. A quote must never reach `pending_approval` with nothing in the queue —
    // that is the state that made this invisible in the first place.
    return transaction(async (db) => {
      const approval = await createApproval(
        {
          approval_type: "quote_send",
          requested_by: session.profile.id,
          assigned_to: data.assignedTo ?? null,
          context_summary: `Quote ${quote.number ?? quote.id} for approval`,
          context_data: {
            quote_id: quote.id,
            quote_number: quote.number,
            total_value: quote.total_value,
            currency: quote.currency,
          },
        },
        db,
      );
      await updateQuoteLifecycleInNeon(data.id, { status: "pending_approval" }, db);
      return serializeHumanApproval(approval);
    });
  });

export const triggerQuoteAgent = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { leadId: string })
  .handler(async ({ data }) => {
    await requireCapability("agents.run", { resourceType: "lead", resourceId: data.leadId });
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

    // After the capability check, so an unauthorised caller is refused for being unauthorised
    // rather than told the agent is inactive; before createAgentRun, so no run row records a
    // dispatch that never happened.
    const policies = await loadAgentPolicies();
    const dispatchable = resolveDispatchableAgent("draft_quote", policies);
    if (!dispatchable.dispatchable) {
      return { triggered: false, reason: dispatchable.reason };
    }

    const { run, created } = await createAgentRun({
      agent_name: dispatchable.agent.display_name,
      workflow_type: "draft_quote",
      subject_id: data.leadId,
      input_data: { lead_id: data.leadId },
      created_by: session.profile.id,
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
  await requireCapability("quotes.view");
  await requireNeonAuthSession();
  return listActivePricingTemplates() as Promise<PricingTemplate[]>;
});

export const getQuoteTemplates = createServerFn({ method: "GET" }).handler(async () => {
  await requireCapability("quotes.view");
  await requireNeonAuthSession();
  return listQuoteTemplates();
});

export const getQuotePdfTemplates = createServerFn({ method: "GET" }).handler(async () => {
  await requireCapability("quotes.view");
  await requireNeonAuthSession();
  return listPdfTemplates("quote");
});

export const getQuoteVersions = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { quoteId: string })
  .handler(async ({ data }) => {
    await requireCapability("quotes.view", { resourceType: "quote", resourceId: data.quoteId });
    await requireNeonAuthSession();
    return listQuoteVersions(data.quoteId);
  });

async function getExistingQuoteVersionOrThrow(
  quoteId: string,
  versionId: string,
): Promise<QuoteVersion> {
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

async function buildNormalizedQuoteSnapshot(quote: Quote): Promise<JsonValue> {
  const normalizedLineItems = await listQuoteLineItems(quote.id);
  return {
    ...quote,
    line_items: normalizedLineItems,
  } as unknown as JsonValue;
}

function assertQuoteCanBeIssued(quote: Quote) {
  if (quote.status === "approved" || quote.status === "sent") {
    return;
  }

  throw new Error("Only approved quotes can be issued");
}

function assertQuoteCanBeAccepted(quote: Quote) {
  if (quote.status === "sent" || quote.status === "viewed" || quote.status === "accepted") {
    return;
  }

  throw new Error("Only sent or viewed quotes can be accepted");
}

function assertQuoteCanBeApproved(quote: Quote) {
  if (
    quote.status === "pending_approval" ||
    quote.status === "approved" ||
    quote.status === "sent"
  ) {
    return;
  }

  throw new Error("Only pending quotes can be approved");
}

function assertQuoteCanBeRejected(quote: Quote) {
  if (quote.status === "pending_approval" || quote.status === "rejected") {
    return;
  }

  throw new Error("Only pending quotes can be rejected");
}

function assertQuoteSendApprovalMatchesQuote(approval: HumanApproval, quoteId: string) {
  if (approval.approval_type !== "quote_send") {
    throw new Error("Only quote-send approvals can issue quotes");
  }

  const context = approval.context_data as { quote_id?: unknown } | null;
  const approvalQuoteId = typeof context?.quote_id === "string" ? context.quote_id : null;
  if (!approvalQuoteId) {
    throw new Error("Approval does not reference quote");
  }
  if (approvalQuoteId !== quoteId) {
    throw new Error("Approval does not match quote");
  }
}

function assertPendingQuoteSendApproval(approval: HumanApproval) {
  if (approval.status !== "pending") {
    throw new Error("Only pending quote-send approvals can change quote lifecycle");
  }
}

async function approveQuoteForSession(quoteId: string, userId: string) {
  const quote = await getQuoteFromNeon(quoteId);
  assertQuoteCanBeApproved(quote);

  if (quote.status === "approved" || quote.status === "sent") {
    return quote;
  }

  return updateQuoteLifecycleInNeon(quote.id, {
    status: "approved",
    approved_by: userId,
  });
}

async function issueQuoteVersionForSession(
  quote: Quote,
  userId: string,
  pdfTemplateId?: string | null,
) {
  assertQuoteCanBeIssued(quote);
  const snapshot = await buildNormalizedQuoteSnapshot(quote);
  const version = quote.issued_version_id
    ? await getExistingQuoteVersionOrThrow(quote.id, quote.issued_version_id)
    : ((await findExistingQuoteVersionByReason(quote.id, "issued")) ??
      (await createQuoteVersion({
        quote_id: quote.id,
        reason: "issued",
        snapshot,
        pdf_template_id: pdfTemplateId ?? null,
        pdf_url: `/quotes/${quote.id}/pdf`,
        created_by: userId,
      })));
  const needsIssueUpdate = quote.status !== "sent" || quote.pdf_url !== version.pdf_url;
  const updated =
    !quote.issued_version_id || needsIssueUpdate
      ? await updateQuoteLifecycleInNeon(quote.id, {
          status: "sent",
          issued_version_id: quote.issued_version_id === version.id ? undefined : version.id,
          pdf_url: version.pdf_url,
        })
      : quote;

  return { quote: updated, version };
}

export const approveQuote = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireCapability("quotes.approve", { resourceType: "quote", resourceId: data.id });
    const session = await requireNeonAuthSession();
    return approveQuoteForSession(data.id, session.profile.id);
  });

export const rejectQuote = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; approvalId?: string; notes?: string })
  .handler(async ({ data }) => {
    await requireCapability("quotes.approve", { resourceType: "quote", resourceId: data.id });
    const session = await requireNeonAuthSession();
    if (data.approvalId) {
      const approval = await getApprovalFromNeon(data.approvalId);
      assertQuoteSendApprovalMatchesQuote(approval, data.id);
      assertPendingQuoteSendApproval(approval);
    }

    const quote = await getQuoteFromNeon(data.id);
    assertQuoteCanBeRejected(quote);

    const updated =
      quote.status === "rejected"
        ? quote
        : await updateQuoteLifecycleInNeon(quote.id, { status: "rejected" });

    if (data.approvalId) {
      await decideApprovalInNeon({
        id: data.approvalId,
        decision: "rejected",
        notes: data.notes,
        actorId: session.profile.id,
      });
    }

    return updated;
  });

export const issueQuoteVersion = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; pdfTemplateId?: string | null })
  .handler(async ({ data }) => {
    await requireCapability("quotes.issue", { resourceType: "quote", resourceId: data.id });
    const session = await requireNeonAuthSession();
    const quote = await getQuoteFromNeon(data.id);
    return issueQuoteVersionForSession(quote, session.profile.id, data.pdfTemplateId);
  });

export const approveAndIssueQuote = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as { id: string; approvalId: string; pdfTemplateId?: string | null; notes?: string },
  )
  .handler(async ({ data }) => {
    await requireCapability("quotes.issue", { resourceType: "quote", resourceId: data.id });
    const session = await requireNeonAuthSession();
    const approval = await getApprovalFromNeon(data.approvalId);
    assertQuoteSendApprovalMatchesQuote(approval, data.id);
    assertPendingQuoteSendApproval(approval);
    const approvedQuote = await approveQuoteForSession(data.id, session.profile.id);
    const issued = await issueQuoteVersionForSession(
      approvedQuote,
      session.profile.id,
      data.pdfTemplateId,
    );
    await decideApprovalInNeon({
      id: data.approvalId,
      decision: "approved",
      actorId: session.profile.id,
      ...(data.notes ? { notes: data.notes } : {}),
    });
    return issued;
  });

export const acceptQuoteAndCreateJobSheet = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireCapability("job_sheets.accept", { resourceType: "quote", resourceId: data.id });
    const session = await requireNeonAuthSession();
    const quote = await getQuoteFromNeon(data.id);
    assertQuoteCanBeAccepted(quote);
    const snapshot = await buildNormalizedQuoteSnapshot(quote);
    const version = quote.accepted_version_id
      ? await getExistingQuoteVersionOrThrow(quote.id, quote.accepted_version_id)
      : ((await findExistingQuoteVersionByReason(quote.id, "accepted")) ??
        (await createQuoteVersion({
          quote_id: quote.id,
          reason: "accepted",
          snapshot,
          pdf_template_id: null,
          pdf_url: quote.pdf_url,
          created_by: session.profile.id,
        })));
    const acceptedAt = quote.accepted_at ?? new Date().toISOString();
    const acceptedBy = quote.accepted_by ?? session.profile.id;
    const needsAcceptanceUpdate =
      quote.status !== "accepted" ||
      quote.accepted_at !== acceptedAt ||
      quote.accepted_by !== acceptedBy;
    const updated =
      !quote.accepted_version_id || needsAcceptanceUpdate
        ? await updateQuoteLifecycleInNeon(quote.id, {
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
      created_by: session.profile.id,
    });

    return { quote: updated, jobSheet };
  });
