import { useEffect } from "react";
import { Link, useRouter, useRouterState, type ErrorComponentProps } from "@tanstack/react-router";

import { ErrorState, PermissionDeniedState } from "@/components/sales/states";
import { Button } from "@/components/ui/button";
import { isPermissionDenial } from "@/lib/errors";
import { workspaceForPath } from "@/lib/workspace-access";

/**
 * The default error boundary for every route that does not define its own.
 *
 * Without it a refused or failed loader fell through to the root boundary, which replaces
 * the whole app — sidebar and header included — with "Something went wrong". A user who
 * followed their own navigation into a workspace their role cannot read lost the shell and
 * was offered "Try again", which can never succeed for a refusal.
 *
 * Registered as the router's `defaultErrorComponent`, it renders inside the shell's outlet:
 * a refusal shows who to ask and a way out, anything else the usual retry. The root keeps its
 * own boundary for failures of the shell itself.
 */
export function RouteErrorBoundary({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const workspace = workspaceForPath(pathname)?.title ?? "this page";
  const denied = isPermissionDenial(error);

  useEffect(() => {
    // A refusal is an expected answer, not a fault worth a console error.
    if (!denied) console.error(error);
  }, [denied, error]);

  if (denied) {
    return (
      <div className="px-4 py-6 md:px-6">
        <PermissionDeniedState
          what={workspace}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild size="sm">
                <Link to="/">Go to Revenue Desk</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/account">Request access</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        title={`${workspace === "this page" ? "This page" : workspace} did not load`}
        error={error}
        onRetry={() => {
          void router.invalidate();
          reset();
        }}
      />
    </div>
  );
}
