import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { triggerN8n } from "@/lib/n8n";
import { createAgentRun, findActiveRun } from "@/server/repositories/agent-runs";
import {
  createQuote as createQuoteInNeon,
  getQuote as getQuoteFromNeon,
  listActivePricingTemplates,
  listQuotes,
  updateQuote as updateQuoteInNeon,
} from "@/server/repositories/quotes";
import { serializeAgentRun } from "@/server-functions/serializers";
import type { PricingTemplate, Quote } from "@/lib/types";

type GetQuotesInput = {
  status?: string;
  lead_id?: string;
  client_id?: string;
  contact_id?: string;
  account_id?: string;
  deal_id?: string;
};

type CreateQuoteInput = Pick<Quote, "lead_id" | "currency"> &
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

    const run = await createAgentRun({
      agent_name: "Quote Draft Agent",
      workflow_type: "draft_quote",
      subject_id: data.leadId,
      input_data: { lead_id: data.leadId },
      created_by: session.user.id,
    });

    const webhookUrl = process.env.N8N_DRAFT_QUOTE_WEBHOOK_URL;
    if (!webhookUrl) {
      return {
        triggered: false,
        run: serializeAgentRun(run),
        reason: "missing_webhook" as const,
      };
    }

    const workflowToken = process.env.N8N_WORKFLOW_TOKEN;
    await triggerN8n(webhookUrl, {
      trigger: "quote.draft_requested",
      lead_id: data.leadId,
      agent_run_id: run.id,
      ...(workflowToken ? { workflow_token: workflowToken } : {}),
      payload: {},
    });
    return { triggered: true, run: serializeAgentRun(run) };
  });

export const getPricingTemplates = createServerFn({ method: "GET" }).handler(async () => {
  await requireNeonAuthSession();
  return listActivePricingTemplates() as Promise<PricingTemplate[]>;
});
