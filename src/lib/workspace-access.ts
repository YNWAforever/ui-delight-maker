import type { Capability } from "@/lib/admin/types";

export type Workspace = {
  url: string;
  /** What the navigation calls it, e.g. "Approvals". */
  title: string;
  /** Capabilities the workspace's list read requires on the server, all of them. */
  requires: readonly Capability[];
};

/**
 * The workspaces in the sidebar, their names, and what their list reads require.
 *
 * Advisory, like everything the client knows about permissions: the server decides again on
 * every read. Each `requires` list mirrors the checks in that workspace's list read — for
 * example `getRenewalsRead` requires `engagements.view` and `products.view`, and
 * `getAiReviewRead` requires `approvals.view` and `agents.view`. The lists are evaluated
 * against the session's effective capability set, which the shell computes without a target
 * and which therefore errs towards allowing (see `effectiveCapabilities`). A workspace is
 * hidden only when even that permissive set says the read would be refused.
 */
export const WORKSPACES: readonly Workspace[] = [
  { url: "/", title: "Revenue Desk", requires: [] },
  { url: "/leads", title: "Leads", requires: ["leads.view"] },
  { url: "/campaigns", title: "Campaigns", requires: ["campaigns.view"] },
  { url: "/ai-review", title: "AI Review", requires: ["approvals.view", "agents.view"] },
  { url: "/quotes", title: "Quotes", requires: ["quotes.view"] },
  { url: "/approvals", title: "Approvals", requires: ["approvals.view"] },
  { url: "/job-sheets", title: "Job Sheets", requires: ["job_sheets.view"] },
  { url: "/accounts", title: "Accounts", requires: ["accounts.view"] },
  { url: "/clients", title: "Active Clients", requires: ["accounts.view"] },
  {
    url: "/relationships",
    title: "Relationships",
    requires: ["accounts.view", "engagements.view"],
  },
  { url: "/renewals", title: "Renewals", requires: ["engagements.view", "products.view"] },
  { url: "/tasks", title: "Tasks", requires: ["tasks.view"] },
  { url: "/agents", title: "AI Ops", requires: ["agents.view"] },
  { url: "/reports", title: "Reports", requires: ["reports.view"] },
  { url: "/settings", title: "Settings", requires: ["agents.view"] },
  { url: "/notifications", title: "Notifications", requires: [] },
  { url: "/account", title: "Your account", requires: [] },
  { url: "/admin", title: "Administration", requires: [] },
];

/** The workspace a path belongs to: the longest matching URL prefix, `/` only exactly. */
export function workspaceForPath(pathname: string): Workspace | undefined {
  let match: Workspace | undefined;
  for (const workspace of WORKSPACES) {
    const hit =
      workspace.url === "/"
        ? pathname === "/"
        : pathname === workspace.url || pathname.startsWith(`${workspace.url}/`);
    if (hit && (!match || workspace.url.length > match.url.length)) match = workspace;
  }
  return match;
}

/**
 * Whether to offer a workspace in the navigation.
 *
 * An empty capability set means the shell could not compute it — `loadAuthenticatedShell`
 * returns `[]` on failure so that controls fail closed. Navigation must not fail closed the
 * same way: an empty sidebar is worse than a link the server then refuses, so with no set
 * every workspace stays visible.
 */
export function canOpenWorkspace(url: string, capabilities: readonly Capability[]): boolean {
  if (capabilities.length === 0) return true;
  const workspace = WORKSPACES.find((item) => item.url === url);
  if (!workspace) return true;
  return workspace.requires.every((capability) => capabilities.includes(capability));
}
