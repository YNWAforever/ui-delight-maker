import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
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

import { getAppShellRead } from "@/server-functions/app-shell";
import { isPublicAuthPath } from "@/lib/auth/auth-routes";
import { toSafeErrorMessage } from "@/lib/errors";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import type { RouterContext } from "@/router";

import appCss from "../styles.css?url";

const AuthenticatedAppShell = lazy(() =>
  import("@/components/authenticated-app-shell").then((module) => ({
    default: module.AuthenticatedAppShell,
  })),
);

function NotFoundComponent() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
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
    </main>
  );
}

/**
 * The last-resort boundary, and the one that catches the most.
 *
 * Most of the thirty-five routes define no `errorComponent` of their own, so anything they
 * throw lands here — including whatever the Neon driver threw. This used to render
 * `{error.message}` verbatim, which is why six route files carry a comment naming that leak
 * as the reason they added a local boundary. The leak was real: a driver failure quotes the
 * failing SQL, and `password authentication failed for user "clientops_rw"` prints the
 * database role to whoever is looking at the screen.
 *
 * `toSafeErrorMessage` passes through a sentence a person wrote and replaces everything else
 * with a generic, actionable one. The full value still reaches `console.error` above, where
 * it belongs.
 */
function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{toSafeErrorMessage(error)}</p>
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
    </main>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context, location }) => {
    if (isPublicAuthPath(location.pathname)) return {};
    return context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.shell(),
        queryFn: () => getAppShellRead(),
      }),
    );
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Fimmick ClientOps" },
      { name: "description", content: "Lead follow-up client operations workspace" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
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
  if (isPublicAuthPath(pathname)) {
    return (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense
        fallback={
          <main
            id="main-content"
            tabIndex={-1}
            className="flex min-h-screen items-center justify-center bg-background"
          >
            <span role="status">Loading workspace...</span>
          </main>
        }
      >
        <AuthenticatedAppShell
          queryClient={queryClient}
          profile={profile ?? null}
          favorites={favorites ?? []}
          adminNavigation={adminNavigation ?? []}
        />
      </Suspense>
    </QueryClientProvider>
  );
}
