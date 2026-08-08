import type { QueryClient } from "@tanstack/react-query";
import type { CompanyWorkspaceResponse, WorkspaceSection } from "@/lib/company-workspace/types";
import { companyWorkspaceKeys } from "./query-keys";

export function getDisplayedOpenSignalCount({
  totalCount,
  visibleSignalIds,
  dismissedSignalIds,
}: {
  totalCount: number;
  visibleSignalIds: readonly string[];
  dismissedSignalIds: readonly string[];
}): number {
  const visibleIds = new Set(visibleSignalIds);
  const dismissedVisibleIds = new Set(
    dismissedSignalIds.filter((signalId) => visibleIds.has(signalId)),
  );

  return Math.max(0, totalCount - dismissedVisibleIds.size);
}

export function seedCompanyWorkspaceCache(
  queryClient: QueryClient,
  accountId: string,
  response: CompanyWorkspaceResponse,
) {
  for (const [section, result] of Object.entries(response.sections)) {
    if (result) {
      queryClient.setQueryData(
        companyWorkspaceKeys.section(accountId, section as WorkspaceSection),
        result,
      );
    }
  }
}
