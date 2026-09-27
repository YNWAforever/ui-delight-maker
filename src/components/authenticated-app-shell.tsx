import type { QueryClient } from "@tanstack/react-query";
import { Outlet, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { GlobalSearch } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import type { AdminNavigationItem } from "@/lib/admin/types";
import type { Profile, WorkspaceFavorite } from "@/lib/types";
import { signOut } from "@/server-functions/auth";

type AuthenticatedAppShellProps = {
  queryClient: QueryClient;
  profile: Profile | null;
  favorites: Array<Pick<WorkspaceFavorite, "id" | "label" | "href">>;
  adminNavigation: readonly AdminNavigationItem[];
};

export function AuthenticatedAppShell({
  queryClient,
  profile,
  favorites,
  adminNavigation,
}: AuthenticatedAppShellProps) {
  const router = useRouter();
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar
          profile={profile}
          favorites={favorites}
          adminNavigation={adminNavigation}
          onSignOut={async () => {
            try {
              await signOut();
              queryClient.clear();
              await router.invalidate();
              await router.navigate({ to: "/login" });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Neon Auth sign-out failed");
            }
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="hidden max-w-md flex-1 md:block lg:max-w-xl">
              <GlobalSearch />
            </div>
            <div className="ml-auto flex items-center gap-2 [&_button[aria-label]]:h-10 [&_button[aria-label]]:w-10">
              <div className="md:hidden">
                <GlobalSearch iconOnly />
              </div>
              <ThemeToggle />
              <NotificationBell />
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary"
                title={profile?.name ?? undefined}
                aria-hidden="true"
              >
                {profile?.name?.slice(0, 2).toUpperCase() ?? "??"}
              </div>
            </div>
          </header>
          <main id="main-content" className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  );
}
