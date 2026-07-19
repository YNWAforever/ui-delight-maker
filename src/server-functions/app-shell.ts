import { createServerFn } from "@tanstack/react-start";
import { loadAuthenticatedShell } from "@/server/app-shell/loaders";
import { getSession } from "@/server-functions/auth";
import { getAdminNavigationFn } from "@/server-functions/admin-users";
import { getWorkspacePreferences } from "@/server-functions/workspace-preferences";

export const getAppShellRead = createServerFn({ method: "GET" }).handler(() =>
  loadAuthenticatedShell({
    getSession: () => getSession(),
    getPreferences: () => getWorkspacePreferences({ data: { objectType: "account" } }),
    getAdminNavigation: () => getAdminNavigationFn(),
  }),
);
