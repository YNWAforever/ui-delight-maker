import type { QueryClient } from "@tanstack/react-query";
import type { CompanyWorkspaceSection } from "@/server/company-workspace/types";
import { crmQueryKeys } from "@/lib/query-keys";

export type CompanyWorkspaceQueryTarget = "overview" | CompanyWorkspaceSection;
export type CompanyWorkspaceMutation =
  | "dismiss_relationship_signal"
  | "run_relationship_intelligence";

const affectedTargets: Record<CompanyWorkspaceMutation, CompanyWorkspaceQueryTarget[]> = {
  dismiss_relationship_signal: ["overview", "intelligence"],
  run_relationship_intelligence: ["overview", "intelligence"],
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
