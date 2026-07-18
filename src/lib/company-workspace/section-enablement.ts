import type { CompanyWorkspaceSection } from "@/server/company-workspace/types";

export type CompanyWorkspaceTab = "overview" | "stakeholders" | "timeline" | "events" | "tasks";

export type CompanyWorkspaceSectionEnablement = Record<CompanyWorkspaceSection, boolean>;

// Task 1 preserves the eager baseline. Task 4 replaces this policy with tab-scoped loading.
export function getCompanyWorkspaceSectionEnablement(
  _tab: CompanyWorkspaceTab,
): CompanyWorkspaceSectionEnablement {
  return {
    commercial: true,
    delivery_finance: true,
    activity: true,
    intelligence: true,
  };
}
