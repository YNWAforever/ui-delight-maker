import type { CompanyWorkspaceSection } from "@/server/company-workspace/types";

export type CompanyWorkspaceTab =
  | "overview"
  | "stakeholders"
  | "timeline"
  | "events"
  | "tasks"
  | "signals";

export type CompanyWorkspaceSectionEnablement = Record<CompanyWorkspaceSection, boolean>;

const none: CompanyWorkspaceSectionEnablement = {
  commercial: false,
  delivery_finance: false,
  activity: false,
  intelligence: false,
};

/**
 * Which section reads the active tab needs. Overview loads with the route; everything
 * else is fetched the first time its tab is opened (Instruction §15).
 *
 * `intelligence` was unreachable here: no tab enabled it, so the section query never ran
 * and the two mutations that invalidated its key were invalidating nothing. The Signals
 * tab is its consumer — it is the one surface that needs every open signal rather than the
 * five Overview carries — so the key is live rather than dead.
 */
export function getCompanyWorkspaceSectionEnablement(
  tab: CompanyWorkspaceTab,
): CompanyWorkspaceSectionEnablement {
  if (tab === "timeline") return { ...none, activity: true };
  if (tab === "events") {
    return { ...none, commercial: true, delivery_finance: true, activity: true };
  }
  if (tab === "tasks") return { ...none, commercial: true, delivery_finance: true };
  if (tab === "signals") return { ...none, intelligence: true };
  return none;
}
