import type { CompanyWorkspaceSection } from "@/server/company-workspace/types";

export type CompanyWorkspaceTab = "overview" | "stakeholders" | "timeline" | "events" | "tasks";

export type CompanyWorkspaceSectionEnablement = Record<CompanyWorkspaceSection, boolean>;

const none: CompanyWorkspaceSectionEnablement = {
  commercial: false,
  delivery_finance: false,
  activity: false,
  intelligence: false,
};

export function getCompanyWorkspaceSectionEnablement(
  tab: CompanyWorkspaceTab,
): CompanyWorkspaceSectionEnablement {
  if (tab === "timeline") return { ...none, activity: true };
  if (tab === "events") {
    return { ...none, commercial: true, delivery_finance: true, activity: true };
  }
  if (tab === "tasks") return { ...none, commercial: true, delivery_finance: true };
  return none;
}
