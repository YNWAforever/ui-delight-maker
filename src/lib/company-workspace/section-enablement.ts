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

/**
 * Which section reads each tab needs before it can render anything.
 *
 * Derived from the enablement map above so the two cannot drift: a section enabled by a tab
 * is exactly a section that tab must be allowed to read. `overview` and `stakeholders` come
 * from the core read (account + contacts), so they need no section capability.
 */
const TAB_SECTIONS: Record<CompanyWorkspaceTab, readonly CompanyWorkspaceSection[]> = {
  overview: [],
  stakeholders: [],
  timeline: ["activity"],
  events: ["commercial", "delivery_finance", "activity"],
  tasks: ["commercial", "delivery_finance"],
  signals: ["intelligence"],
};

/**
 * Whether the caller may open a tab, given the server-evaluated section access flags.
 *
 * The section handlers still refuse a denied read; this only keeps the UI from offering a
 * tab that can only produce a permission error, and keeps the tab's hidden sections from
 * being fetched. A missing flag (`undefined`) means the read predates the flags, so the tab
 * stays visible and the server remains the authority.
 */
export function isCompanyWorkspaceTabAllowed(
  tab: CompanyWorkspaceTab,
  access?: Partial<Record<CompanyWorkspaceSection, boolean>>,
): boolean {
  if (!access) return true;
  return TAB_SECTIONS[tab].every((section) => access[section] !== false);
}
