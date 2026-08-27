import type { QueryClient } from "@tanstack/react-query";
import type { CompanyWorkspaceSection } from "@/server/company-workspace/types";
import { crmQueryKeys } from "@/lib/query-keys";

export type CompanyWorkspaceQueryTarget = "overview" | CompanyWorkspaceSection;
export type CompanyWorkspaceMutation =
  | "dismiss_relationship_signal"
  | "run_relationship_intelligence"
  | "account_contact";

/**
 * What each Account 360 mutation makes stale.
 *
 * Two corrections are recorded here because both were user-visible.
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
 * `commercial` and `delivery_finance` are deliberately *not* listed. Neither mutation
 * writes a client, engagement, quote, task or job sheet, so invalidating them would buy a
 * refetch of data that cannot have changed.
 */
const affectedTargets: Record<CompanyWorkspaceMutation, CompanyWorkspaceQueryTarget[]> = {
  dismiss_relationship_signal: ["overview", "intelligence", "activity"],
  run_relationship_intelligence: ["overview", "intelligence", "activity"],
  // A stakeholder write changes `core.contacts`, which arrives with the overview read.
  account_contact: ["overview"],
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
