import type { QueryClient } from "@tanstack/react-query";
import type { CompanyWorkspaceSection } from "@/server/company-workspace/types";
import { crmQueryKeys } from "@/lib/query-keys";

export type CompanyWorkspaceQueryTarget = "overview" | CompanyWorkspaceSection;
export type CompanyWorkspaceMutation =
  | "dismiss_relationship_signal"
  | "run_relationship_intelligence"
  | "account_contact"
  | "accept_quote"
  | "change_quote"
  | "change_task";

/**
 * What each Account 360 mutation makes stale.
 *
 * This is the union of two independent corrections, both user-visible, and neither
 * subsumes the other.
 *
 * `activity` was missing from both signal mutations. The Activity tab is driven by its own
 * query key, so a dismissal — and every timeline entry a relationship-intelligence run
 * exists to produce — stayed invisible there until the 30s stale time lapsed or the window
 * regained focus. That is exactly the tab a reader opens to check the thing just happened.
 *
 * `intelligence` was the opposite problem: it was invalidated by both mutations and read by
 * nothing, because no tab enabled the section. It is kept — and is now correct — because
 * the Signals tab consumes it (see `section-enablement.ts`).
 *
 * `core` is not a target of its own — the route loads company and contact facts under the
 * `overview` key — so a mutation that changes them lists `overview` here.
 *
 * `activity` looks unrelated to quotes and tasks but is not: the account timeline behind it
 * unions the `tasks` and `quotes` tables directly (see `getAccountTimeline` in
 * `server/repositories/account-timeline.ts`), so both stale it.
 *
 * For the signal and contact mutations, `commercial` and `delivery_finance` are
 * deliberately *not* listed. None of them writes a client, engagement, quote, task or job
 * sheet, so invalidating those would buy a refetch of data that cannot have changed.
 */
const affectedTargets: Record<CompanyWorkspaceMutation, CompanyWorkspaceQueryTarget[]> = {
  dismiss_relationship_signal: ["overview", "intelligence", "activity"],
  run_relationship_intelligence: ["overview", "intelligence", "activity"],
  // A stakeholder write changes `core.contacts`, which arrives with the overview read.
  account_contact: ["overview"],
  // Acceptance writes a job sheet as well as the quote, which is why this is the one quote
  // mutation that reaches delivery_finance.
  accept_quote: ["overview", "commercial", "delivery_finance", "activity"],
  // `overview` looks redundant here, since its quote count and totals have no status predicate
  // and a pure status change cannot move them. It is not: the approval and issue paths in
  // `routes/quotes.$id.tsx` call `saveEditableQuoteFields()` first, so a "status" transition can
  // arrive with edited line items behind it, which does move the totals.
  change_quote: ["overview", "commercial", "activity"],
  change_task: ["delivery_finance", "activity"],
};

export function companyWorkspaceQueryKey(accountId: string, target: CompanyWorkspaceQueryTarget) {
  return crmQueryKeys.companyWorkspace.section(accountId, target);
}

export function getCompanyWorkspaceMutationQueryKeys(
  accountId: string,
  mutation: CompanyWorkspaceMutation,
) {
  return affectedTargets[mutation].map((target) => companyWorkspaceQueryKey(accountId, target));
}

export async function invalidateCompanyWorkspaceMutation(
  queryClient: QueryClient,
  accountId: string,
  mutation: CompanyWorkspaceMutation,
) {
  await Promise.all(
    getCompanyWorkspaceMutationQueryKeys(accountId, mutation).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, exact: true, refetchType: "active" }),
    ),
  );
}

/**
 * Quotes and tasks carry a nullable `account_id`. A record with no company has no workspace to
 * refresh, so callers can hand over the raw column instead of narrowing it at every site.
 */
export async function invalidateLinkedCompanyWorkspaceMutation(
  queryClient: QueryClient,
  accountId: string | null | undefined,
  mutation: CompanyWorkspaceMutation,
) {
  if (!accountId) {
    return;
  }

  await invalidateCompanyWorkspaceMutation(queryClient, accountId, mutation);
}
