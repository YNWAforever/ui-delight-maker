import type { QueryClient } from "@tanstack/react-query";
import type {
  CompanyWorkspaceResponse,
  WorkspaceSection,
} from "@/lib/company-workspace/types";
import { companyWorkspaceKeys } from "./query-keys";

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
