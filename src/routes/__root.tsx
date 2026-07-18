import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  redirect,
} from "@tanstack/react-router";
import { GlobalSearch } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

import { getSession, signOut } from "@/server-functions/auth";
import { getWorkspacePreferences } from "@/server-functions/workspace-preferences";
import { getAdminNavigationFn } from "@/server-functions/admin-users";
import { isPublicAuthPath } from "@/lib/auth/auth-routes";
import type { Profile, WorkspaceFavorite } from "@/lib/types";
import type { RouterContext } from "@/router";
import type { AdminNavigationItem } from "@/lib/admin/types";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to pipeline
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    if (isPublicAuthPath(location.pathname)) return {};
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    let favorites: WorkspaceFavorite[] = [];
    try {
      const preferences = await getWorkspacePreferences({ data: { objectType: "account" } });
      favorites = preferences.favorites;
    } catch (error) {
      console.error("Workspace preferences unavailable", error);
    }

    let adminNavigation: AdminNavigationItem[] = [];
    try {
      adminNavigation = await getAdminNavigationFn();
    } catch (error) {
      console.error("Admin navigation unavailable", error);
    }

    return {
      user: session.user,
      profile: session.profile as Profile | null,
      favorites,
      adminNavigation,
    };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Fimmick ClientOps" },
      { name: "description", content: "Lead follow-up client operations workspace" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}",
          }}
        />
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to main content
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, profile, favorites, adminNavigation } = Route.useRouteContext();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const router = useRouter();

  if (isPublicAuthPath(pathname)) {
    return <Outlet />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar
            profile={profile ?? null}
            favorites={favorites ?? []}
            adminNavigation={adminNavigation ?? []}
            onSignOut={async () => {
              try {
                await signOut();
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
              <div className="hidden max-w-md flex-1 md:block">
                <GlobalSearch />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div className="md:hidden">
                  <GlobalSearch iconOnly />
                </div>
                <ThemeToggle />
                <NotificationBell />
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
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
    </QueryClientProvider>
  );
}
