import { createServerFn } from "@tanstack/react-start";
import { getNeonAuthSession, type AppSession } from "@/lib/auth/neon-auth.server";
import { loadAuthenticatedShell } from "@/server/app-shell/loaders";
import { getAdminNavigationForContext } from "@/server/admin/navigation.server";
import { listWorkspaceFavorites } from "@/server/repositories/workspace-preferences";
import {
  effectiveCapabilitiesWithContext,
  loadRequestAuthorization,
  type RequestAuthorization,
} from "@/server/auth/authorization.server";

export const getAppShellRead = createServerFn({ method: "GET" }).handler(() => {
  // This closure belongs to one handler invocation. It must never become a module-level
  // cache: the next HTTP request must reload the session and permission overrides.
  let appSession: AppSession | null = null;
  let authorization: Promise<RequestAuthorization> | null = null;

  const session = () => {
    if (!appSession) throw new Error("Authentication required");
    return appSession;
  };
  const context = () => {
    if (!authorization) throw new Error("Authorization context unavailable");
    return authorization;
  };

  return loadAuthenticatedShell({
    getSession: async () => {
      appSession = await getNeonAuthSession();
      if (appSession) authorization = loadRequestAuthorization(appSession);
      return appSession;
    },
    getPreferences: async () => ({
      favorites: await listWorkspaceFavorites(session().profile.id),
    }),
    getAdminNavigation: async () => getAdminNavigationForContext(await context()),
    getCapabilities: async () => effectiveCapabilitiesWithContext(await context()),
  });
});
