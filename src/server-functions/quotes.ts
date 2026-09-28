import { parseOperationInput } from "@/lib/operations/errors";
import { resolveDispatchableAgent } from "@/lib/agents";
import {
  loadRequestAuthorization,
  requireCapability,
  requirePageAuthorization,
} from "@/server/auth/authorization.server";
import {
  acceptQuoteCommand,
  approveAndIssueQuoteCommand,
  decideQuoteSendCommand,
  issueQuoteCommand,
  requestQuoteApprovalCommand,
} from "@/server/commands/quote-lifecycle.server";
import {
  createQuoteRevision as createQuoteRevisionCommand,
  updateQuoteCommercial,
} from "@/server/commands/quote-revision.server";
import { loadAgentPolicies } from "@/server/repositories/agent-policy";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { getN8nDispatchConfig, triggerN8n } from "@/lib/n8n";
import { buildQuoteDraftPayload } from "@/lib/workflows/payloads";
import { listPdfTemplates, listQuoteTemplates } from "@/server/repositories/quote-templates";
import { listQuoteVersions } from "@/server/repositories/quote-versions";
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
  listQuotesPage,
  type QuoteListRow,
  type QuotePageFilters,
} from "@/server/repositories/quotes";
import { serializeAgentRun, serializeHumanApproval } from "@/lib/serializable";
import type { PricingTemplate, Quote } from "@/lib/types";
import {
  AcceptQuoteSchema,
  ApproveAndIssueQuoteSchema,
  ApproveQuoteSchema,
  IdSchema,
  IssueQuoteVersionSchema,
  LeadIdSchema,
  QuoteCreateSchema,
  QuoteMutationSchema,
  QuoteRevisionSchema,
  QuoteVersionListSchema,
  RejectQuoteSchema,
  RequestQuoteApprovalSchema,
} from "@/lib/operations/input-schemas";

type GetQuotesInput = {
  status?: string;
  lead_id?: string;
  client_id?: string;
  contact_id?: string;
  account_id?: string;
  deal_id?: string;
};

/**
 * A `listQuotesPage` row, redacted per-row against the ownership of its own linked lead or
 * client, rather than against a page-level "may this actor see leads/clients at all" pair.
 *
 * The repository now always joins and always selects a real `linked_company_name` (see
 * `src/server/repositories/quote-list-query.ts`), so this handler is the one place that
 * decides, per row, whether that name may leave the server. `linked_record_restricted` is the
 * per-row replacement for the page-level `visibility` pair the route used to receive: without
 * it, a quote with a genuinely absent name (impossible today — `quotes_must_have_context` and
 * both companies' `company_name` columns being `not null` rule it out, but the flag does not
 * depend on that holding forever) would be indistinguishable from one redacted for this reader.
 * `false` covers both "visible" and "nothing to redact" (no lead_id and no client_id); only a
 * row actually nulled below sets it `true`.
 */
export type QuoteListItem = QuoteListRow & { linked_record_restricted: boolean };

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
    // One authorization context load answers every question this page asks: "can this actor
    // see the quotes surface at all" (quotes.view, required, throws on denial exactly as the
    // single-capability-set check it replaced) and, via `rows`, "which specific linked leads
    // and clients may they see once each one's own ownership is resolved". The separate session
    // call stays gone: the context load already establishes it internally. This comment
    // deliberately avoids naming the authorization helpers by their identifiers — the counter
    // in authorization-surface.test.ts matches those as bare substrings.
    const { access, rows } = await requirePageAuthorization(["quotes.view"], {
      optional: ["leads.view", "accounts.view"],
    });
    const canSeeLeads = access["leads.view"] === true;
    // `accounts.view` gates clients — the same capability the quote detail page uses for its
    // client check, so the list and the detail page agree by construction.
    const canSeeClients = access["accounts.view"] === true;

    const page = await listQuotesPage({
      ...data,
      searchScope: { leads: canSeeLeads, clients: canSeeClients },
    });

    // Capability first, then ownership: an actor who lacks the capability outright is denied
    // every row of that kind, so no ownership query is spent finding out what they already
    // cannot see. `leadIds`/`clientIds` are gathered from every quote carrying that id — not
    // only the ones where it would actually be displayed — because `rows.allow` batches into
    // one query regardless of how many ids it is asked about; which id a row is judged against
    // is decided per row below, matching `linkedRecord` in src/routes/quotes.tsx (a client wins
    // over a lead when a quote carries both).
    const leadIds = page.items.filter((item) => item.lead_id).map((item) => item.lead_id!);
    const clientIds = page.items.filter((item) => item.client_id).map((item) => item.client_id!);

    const [leadDecisions, clientDecisions] = await Promise.all([
      canSeeLeads && leadIds.length > 0
        ? rows.allow("leads.view", "lead", leadIds)
        : Promise.resolve(new Map<string, boolean>()),
      canSeeClients && clientIds.length > 0
        ? rows.allow("accounts.view", "client", clientIds)
        : Promise.resolve(new Map<string, boolean>()),
    ]);

    const items = page.items.map((item): QuoteListItem => {
      // A client on the row wins over a lead, exactly as `linkedRecord` renders it — so only
      // the winning id's decision determines what this row shows.
      if (item.client_id) {
        const visible = canSeeClients && clientDecisions.get(item.client_id) === true;
        return visible
          ? { ...item, linked_record_restricted: false }
          : { ...item, linked_company_name: null, linked_record_restricted: true };
      }
      if (item.lead_id) {
        const visible = canSeeLeads && leadDecisions.get(item.lead_id) === true;
        return visible
          ? { ...item, linked_record_restricted: false }
          : { ...item, linked_company_name: null, linked_record_restricted: true };
      }
      return { ...item, linked_record_restricted: false };
    });

    return { ...page, items };
  });

export const getQuote = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(IdSchema, data))
  .handler(async ({ data }) => {
    await requireCapability("quotes.view", { resourceType: "quote", resourceId: data.id });
    await requireNeonAuthSession();
    return getQuoteFromNeon(data.id);
  });

export const createQuote = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(QuoteCreateSchema, data))
  .handler(async ({ data }) => {
    await requireCapability("quotes.create");
    const session = await requireNeonAuthSession();
    return createQuoteInNeon({ ...data, created_by: session.profile.id });
  });

export const updateQuote = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(QuoteMutationSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "quotes.update",
      { resourceType: "quote", resourceId: data.id },
      context,
    );
    assertNoLifecycleQuoteUpdates(data.updates);
    return updateQuoteCommercial(context, { id: data.id, patch: data.updates });
  });

export const createQuoteRevision = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(QuoteRevisionSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("quotes.create", {}, context);
    await requireCapability("quotes.view", { resourceType: "quote", resourceId: data.id }, context);
    return createQuoteRevisionCommand(context, data);
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
  .validator((data: unknown) => parseOperationInput(RequestQuoteApprovalSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "quotes.request_approval",
      { resourceType: "quote", resourceId: data.id },
      context,
    );
    return serializeHumanApproval(await requestQuoteApprovalCommand(context, data));
  });

export const triggerQuoteAgent = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(LeadIdSchema, data))
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
  .validator((data: unknown) => parseOperationInput(QuoteVersionListSchema, data))
  .handler(async ({ data }) => {
    await requireCapability("quotes.view", { resourceType: "quote", resourceId: data.quoteId });
    await requireNeonAuthSession();
    return listQuoteVersions(data.quoteId);
  });

export const approveQuote = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(ApproveQuoteSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "quotes.approve",
      { resourceType: "quote", resourceId: data.id },
      context,
    );
    const result = await decideQuoteSendCommand(context, { ...data, decision: "approved" });
    return result.quote;
  });

export const rejectQuote = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(RejectQuoteSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "quotes.approve",
      { resourceType: "quote", resourceId: data.id },
      context,
    );
    const result = await decideQuoteSendCommand(context, { ...data, decision: "rejected" });
    return result.quote;
  });

export const issueQuoteVersion = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(IssueQuoteVersionSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "quotes.issue",
      { resourceType: "quote", resourceId: data.id },
      context,
    );
    return issueQuoteCommand(context, data);
  });

export const approveAndIssueQuote = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(ApproveAndIssueQuoteSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "quotes.approve",
      { resourceType: "quote", resourceId: data.id },
      context,
    );
    await requireCapability(
      "quotes.issue",
      { resourceType: "quote", resourceId: data.id },
      context,
    );
    await requireCapability(
      "approvals.decide",
      { resourceType: "human_approval", resourceId: data.approvalId },
      context,
    );
    return approveAndIssueQuoteCommand(context, { ...data, decision: "approved" });
  });

export const acceptQuoteAndCreateJobSheet = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(AcceptQuoteSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "job_sheets.accept",
      { resourceType: "quote", resourceId: data.id },
      context,
    );
    return acceptQuoteCommand(context, data);
  });
