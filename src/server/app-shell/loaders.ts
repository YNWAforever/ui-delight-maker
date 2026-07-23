import { redirect } from "@tanstack/react-router";
import type { AdminNavigationItem } from "@/lib/admin/types";
import type { Profile, WorkspaceFavorite } from "@/lib/types";

export type AppShellRead = {
  user: { id: string; email?: string | null; name?: string | null };
  profile: Profile | null;
  favorites: WorkspaceFavorite[];
  adminNavigation: AdminNavigationItem[];
};

type AuthenticatedSession = {
  user: AppShellRead["user"];
  profile?: unknown;
};

type AuthenticatedShellDependencies = {
  getSession: () => Promise<AuthenticatedSession | null>;
  getPreferences: () => Promise<{ favorites: WorkspaceFavorite[] }>;
  getAdminNavigation: () => Promise<readonly AdminNavigationItem[]>;
};

export async function loadAuthenticatedShell({
  getSession,
  getPreferences,
  getAdminNavigation,
}: AuthenticatedShellDependencies): Promise<AppShellRead> {
  const session = await getSession();
  if (!session) {
    throw redirect({ to: "/login" });
  }

  const [preferences, adminNavigation] = await Promise.all([
    getPreferences().catch((error) => {
      console.error("Workspace preferences unavailable", error);
      return { favorites: [] };
    }),
    getAdminNavigation().catch((error) => {
      console.error("Admin navigation unavailable", error);
      return [];
    }),
  ]);

  return {
    user: session.user,
    profile: (session.profile ?? null) as Profile | null,
    favorites: preferences.favorites,
    adminNavigation: [...adminNavigation],
  };
}
