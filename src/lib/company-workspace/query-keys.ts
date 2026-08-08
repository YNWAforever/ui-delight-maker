import type { WorkspaceSection } from "@/lib/company-workspace/types";

export const companyWorkspaceKeys = {
  all: () => ["company-workspace"] as const,
  account: (accountId: string) => ["company-workspace", accountId] as const,
  section: (accountId: string, section: WorkspaceSection) =>
    ["company-workspace", accountId, section] as const,
};
