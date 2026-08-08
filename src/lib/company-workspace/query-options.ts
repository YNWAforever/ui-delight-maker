import type { WorkspaceSection } from "@/lib/company-workspace/types";
import { getCompanyWorkspace } from "@/server-functions/company-workspace";
import { companyWorkspaceKeys } from "./query-keys";

class CompanyWorkspaceSectionQueryError extends Error {
  readonly code: string;
  readonly correlationId: string;

  constructor({
    code,
    message,
    correlationId,
  }: {
    code: string;
    message: string;
    correlationId: string;
  }) {
    super(message);
    this.name = "CompanyWorkspaceSectionQueryError";
    this.code = code;
    this.correlationId = correlationId;
  }
}

export function companyWorkspaceSectionOptions(accountId: string, section: WorkspaceSection) {
  return {
    queryKey: companyWorkspaceKeys.section(accountId, section),
    queryFn: async () => {
      const response = await getCompanyWorkspace({
        data: { accountId, sections: [section] },
      });
      const sectionResult = response.sections[section];

      if (sectionResult?.status === "error") {
        throw new CompanyWorkspaceSectionQueryError({
          code: sectionResult.error.code,
          message: sectionResult.error.message,
          correlationId: sectionResult.meta.correlationId,
        });
      }

      return sectionResult;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  };
}
