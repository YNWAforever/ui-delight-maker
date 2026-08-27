import { redirect } from "@tanstack/react-router";
import type { AdminNavigationItem, Capability } from "@/lib/admin/types";
import type { Profile, WorkspaceFavorite } from "@/lib/types";

export type AppShellRead = {
  user: { id: string; email?: string | null; name?: string | null };
  profile: Profile | null;
  favorites: WorkspaceFavorite[];
  adminNavigation: AdminNavigationItem[];
  /**
   * What this actor may do INDEPENDENT OF ANY TARGET.
   *
   * Not "may they edit this lead" — ownership and manager scope are resolved server-side
   * per request and are deliberately not answerable from here. Read it with
   * `hasCapability` from `@/lib/admin/capabilities`.
   */
  capabilities: readonly Capability[];
};

type AuthenticatedSession = {
  user: AppShellRead["user"];
  profile?: unknown;
};

type AuthenticatedShellDependencies = {
  getSession: () => Promise<AuthenticatedSession | null>;
  getPreferences: () => Promise<{ favorites: WorkspaceFavorite[] }>;
  getAdminNavigation: () => Promise<readonly AdminNavigationItem[]>;
  getCapabilities: () => Promise<readonly Capability[]>;
};

export async function loadAuthenticatedShell({
  getSession,
  getPreferences,
  getAdminNavigation,
  getCapabilities,
}: AuthenticatedShellDependencies): Promise<AppShellRead> {
  const session = await getSession();
  if (!session) {
    throw redirect({ to: "/login" });
  }

  const [preferences, adminNavigation, capabilities] = await Promise.all([
    getPreferences().catch((error) => {
      console.error("Workspace preferences unavailable", error);
      return { favorites: [] };
    }),
    getAdminNavigation().catch((error) => {
      console.error("Admin navigation unavailable", error);
      return [];
    }),
    // Fail closed: an empty set disables controls the actor may hold, which a reload
    // fixes. Assuming permission would offer actions the server then refuses.
    getCapabilities().catch((error) => {
      console.error("Effective capabilities unavailable", error);
      return [] as readonly Capability[];
    }),
  ]);

  return {
    user: session.user,
    profile: (session.profile ?? null) as Profile | null,
    favorites: preferences.favorites,
    adminNavigation: [...adminNavigation],
    capabilities,
  };
}
