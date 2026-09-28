import { AdminError } from "@/lib/admin/errors";
import type { AdminNavigationItem } from "@/lib/admin/types";
import { checkWithContext, type RequestAuthorization } from "@/server/auth/authorization.server";

const adminNavigationItems = [
  { key: "overview", label: "Overview", capability: "users.view", href: "/admin" },
  { key: "people", label: "People", capability: "users.view", href: "/admin/people" },
  { key: "teams", label: "Teams", capability: "teams.view", href: "/admin/teams" },
  { key: "access", label: "Access", capability: "permissions.view", href: "/admin/access" },
  { key: "audit", label: "Audit", capability: "audit.view", href: "/admin/audit" },
] as const satisfies readonly AdminNavigationItem[];

export async function getAdminNavigationForContext(
  context: RequestAuthorization,
): Promise<AdminNavigationItem[]> {
  const decisions = await checkWithContext(
    context,
    adminNavigationItems.map((item) => ({ capability: item.capability })),
  );
  if (!decisions.some((decision) => decision.allowed)) {
    throw new AdminError("FORBIDDEN", "You do not have this capability");
  }
  return adminNavigationItems.filter((_, index) => decisions[index].allowed);
}
