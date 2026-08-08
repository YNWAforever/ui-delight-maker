import type { WorkspaceSection } from "@/lib/company-workspace/types";
import { getCompanyWorkspace } from "@/server-functions/company-workspace";
import { companyWorkspaceKeys } from "./query-keys";

export function companyWorkspaceSectionOptions(
  accountId: string,
  section: WorkspaceSection,
) {
  return {
    queryKey: companyWorkspaceKeys.section(accountId, section),
    queryFn: async () => {
      const response = await getCompanyWorkspace({
        data: { accountId, sections: [section] },
      });
      return response.sections[section];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  };
}
