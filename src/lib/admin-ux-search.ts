import { z } from "zod";

import type { AccountLifecycleStage, LeadSource, WorkspaceViewConfig } from "@/lib/types";
import type { AiReviewState, PipelineFilters, SlaState } from "@/lib/pipeline";

export const LEAD_SOURCES = [
  "website",
  "whatsapp",
  "email",
  "linkedin",
  "csv",
  "event",
  "manual",
] as const satisfies readonly LeadSource[];

export const SLA_STATES = ["overdue", "due_today", "clear"] as const satisfies readonly SlaState[];

export const AI_REVIEW_STATES = [
  "running",
  "ready_for_review",
  "approved",
  "sent",
  "failed",
  "idle",
] as const satisfies readonly AiReviewState[];

export const ACCOUNT_LIFECYCLE_STAGES = [
  "prospect",
  "active_client",
  "at_risk",
  "churned",
  "partner",
  "vendor",
] as const satisfies readonly AccountLifecycleStage[];

export const COMPANY_SORT_KEYS = [
  "last_activity_at:desc",
  "name:asc",
  "relationship_health:asc",
  "relationship_health:desc",
] as const;

export type CompanySortKey = (typeof COMPANY_SORT_KEYS)[number];

/**
 * Account 360's six sections (Instruction §9.5).
 *
 * The stored values are deliberately the historical ones — `timeline` is the Activity
 * section, `events` is Commercial, `tasks` is Delivery & Finance. Renaming them would
 * break every bookmark and every link already in circulation for no user-visible gain,
 * since what a reader sees is the tab label, not the search param. `signals` is new: the
 * Signals section had no tab at all, which is why the `intelligence` workspace section had
 * no consumer on this page.
 */
export const ACCOUNT_DETAIL_TABS = [
  "overview",
  "stakeholders",
  "events",
  "tasks",
  "timeline",
  "signals",
] as const;

/**
 * `files` and `comments` were removed with the tabs themselves — both were fabricated
 * client-side state with no table behind them. Dropping them here matters: the schema
 * `.catch(undefined)`s an unrecognised tab, so a bookmarked `?tab=files` now lands on
 * Overview instead of selecting a tab that no longer renders anything.
 */
export const LEAD_DETAIL_TABS = ["overview", "activity", "quotes", "insights"] as const;

export const CLIENT_DETAIL_TABS = [
  "overview",
  "contacts",
  "engagements",
  "quotes",
  "job-sheets",
  "tasks",
  "timeline",
] as const;

// "comments" and "files" were removed with the two fabricated tabs they addressed
// (IF-C2-19..22): there is no comment table and no attachment storage in the schema.
// The schema catches an obsolete tab value, so old links land on Line items.
export const QUOTE_DETAIL_TABS = ["items", "versions", "preview"] as const;
export const AGENT_DETAIL_TABS = ["runs", "memory", "config"] as const;
export const SETTINGS_TABS = [
  "profile",
  "team",
  "pricing",
  "products",
  "agents",
  "notifications",
  "apikeys",
] as const;

const optionalSearchString = z.string().trim().min(1).optional().catch(undefined);

export const revenueDeskSearchSchema = z
  .object({
    q: optionalSearchString,
    source: z.enum(LEAD_SOURCES).optional().catch(undefined),
    owner: optionalSearchString,
    urgency: z.enum(SLA_STATES).optional().catch(undefined),
    ai: z.enum(AI_REVIEW_STATES).optional().catch(undefined),
    lead: optionalSearchString,
  })
  .passthrough();

export type RevenueDeskSearch = z.infer<typeof revenueDeskSearchSchema>;

export function pipelineFiltersFromSearch(search: RevenueDeskSearch): PipelineFilters {
  return {
    search: search.q ?? "",
    source: search.source ?? "all",
    owner: search.owner ?? "all",
    urgency: search.urgency ?? "all",
    aiState: search.ai ?? "all",
  };
}

export function pipelineSearchFromFilters(
  filters: PipelineFilters,
): Omit<RevenueDeskSearch, "lead"> {
  const search: Partial<Omit<RevenueDeskSearch, "lead">> = {};
  if (filters.search?.trim()) search.q = filters.search.trim();
  if (filters.source && filters.source !== "all") search.source = filters.source;
  if (filters.owner && filters.owner !== "all") search.owner = filters.owner;
  if (filters.urgency && filters.urgency !== "all") search.urgency = filters.urgency;
  if (filters.aiState && filters.aiState !== "all") search.ai = filters.aiState;
  return search;
}

export const companiesSearchSchema = z
  .object({
    /** Company-name search. Reaches `listAccountsPage`'s `query`, so it spans the tenant. */
    q: optionalSearchString,
    lifecycle: z.enum(ACCOUNT_LIFECYCLE_STAGES).optional().catch(undefined),
    sort: z.enum(COMPANY_SORT_KEYS).optional().catch(undefined),
    /** Which account's preview panel is open. A UI-only param — never a loader dep. */
    account: optionalSearchString,
    page: z.coerce.number().int().min(1).default(1).catch(1),
    limit: z.coerce.number().int().min(1).max(100).default(50).catch(50),
  })
  .passthrough();

export type CompaniesSearch = z.infer<typeof companiesSearchSchema>;

export function companySortFromKey(key?: CompanySortKey): WorkspaceViewConfig["sort"] {
  switch (key) {
    case "name:asc":
      return { field: "name", direction: "asc" };
    case "relationship_health:asc":
      return { field: "relationship_health", direction: "asc" };
    case "relationship_health:desc":
      return { field: "relationship_health", direction: "desc" };
    case "last_activity_at:desc":
    default:
      return { field: "last_activity_at", direction: "desc" };
  }
}

export function companySortToKey(sort: WorkspaceViewConfig["sort"]): CompanySortKey | undefined {
  if (sort.field === "last_activity_at" && sort.direction === "desc") return undefined;
  if (sort.field === "name" && sort.direction === "asc") return "name:asc";
  if (sort.field === "relationship_health" && sort.direction === "asc") {
    return "relationship_health:asc";
  }
  if (sort.field === "relationship_health" && sort.direction === "desc") {
    return "relationship_health:desc";
  }
  return undefined;
}

export const accountDetailSearchSchema = z
  .object({ tab: z.enum(ACCOUNT_DETAIL_TABS).optional().catch(undefined) })
  .passthrough();

export const leadDetailSearchSchema = z
  .object({ tab: z.enum(LEAD_DETAIL_TABS).optional().catch(undefined) })
  .passthrough();

export const clientDetailSearchSchema = z
  .object({ tab: z.enum(CLIENT_DETAIL_TABS).optional().catch(undefined) })
  .passthrough();

export const quoteDetailSearchSchema = z
  .object({
    edit: z.boolean().optional().catch(undefined),
    approvalId: optionalSearchString,
    tab: z.enum(QUOTE_DETAIL_TABS).optional().catch(undefined),
  })
  .passthrough();

export const agentDetailSearchSchema = z
  .object({ tab: z.enum(AGENT_DETAIL_TABS).optional().catch(undefined) })
  .passthrough();

export const settingsSearchSchema = z
  .object({ tab: z.enum(SETTINGS_TABS).optional().catch(undefined) })
  .passthrough();
