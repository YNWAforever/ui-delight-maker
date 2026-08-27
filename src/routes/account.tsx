import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import { AccountSettings, type AccountTab } from "@/components/account/account-settings";
import { ErrorState, StaleDataIndicator, WorkspaceHeader } from "@/components/sales";
import { accountSettingsSearchSchema } from "@/lib/admin-ux-search";
import { toSafeErrorMessage } from "@/lib/errors";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import {
  cancelMyDelegation,
  createMyAccessRequest,
  createMyDelegation,
  getMyAccount,
  revokeMyAppSessions,
  updateMyAvailability,
  updateMyProfile,
} from "@/server-functions/account";

/**
 * The signed-in user's own record.
 *
 * The plan omitted this route entirely (PC-1) even though it is the only place in the
 * product where six server-backed personal writes live - profile, availability, app-session
 * revocation, delegation create and cancel, and access requests. It gets the same shell as
 * every other workspace here: one `WorkspaceHeader`, a route-level error boundary that
 * sanitizes, URL-persisted tabs, and an in-flight lock on every write.
 *
 * It deliberately stays out of navigation (design decisions 1): it is entered from context -
 * the post-invitation redirect - not browsed to.
 */

const accountQueryKey = crmQueryKeys.account.detail("me");

const accountQueryOptions = () =>
  routeQueryOptions({
    queryKey: accountQueryKey,
    queryFn: () => getMyAccount(),
  });

export const Route = createFileRoute("/account")({
  validateSearch: accountSettingsSearchSchema,
  head: () => ({
    meta: [{ title: "Account - Fimmick ClientOps" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(accountQueryOptions()),
  errorComponent: AccountErrorState,
  component: AccountPage,
});

/**
 * `getMyAccount` throws `AdminError("CONFLICT", ...)` when no profile row exists, and
 * everything under it is raw Neon SQL. Without this the thrown text lands in the root
 * boundary (IF-E1-32 is the same defect, one slice over).
 */
function AccountErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Your account did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/account" });
        }}
      />
    </div>
  );
}

function AccountPage() {
  const loadedAccount = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const accountQuery = useQuery({
    ...accountQueryOptions(),
    initialData: loadedAccount,
  });

  const updatedAt = Number.isFinite(accountQuery.dataUpdatedAt)
    ? new Date(accountQuery.dataUpdatedAt).toISOString()
    : null;

  /**
   * Every account write goes through here.
   *
   * Two things changed. The catch used to toast `error.message`, so a Zod message naming a
   * field, an `AdminError` string and any Neon driver text all reached the user verbatim
   * (IF-E2-47) - it now goes through the shared sanitizer, and the raw value still reaches
   * the console. And the rethrow is deliberate: the component that called it needs to know
   * the write failed so it can hold its own save state at "error" rather than stamping a
   * save time on a write that never landed.
   */
  async function runMutation<T>(
    action: () => Promise<T>,
    successMessage: string,
    refreshShell = false,
  ) {
    try {
      const result = await action();
      toast.success(successMessage);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountQueryKey, exact: true }),
        ...(refreshShell
          ? [
              queryClient.invalidateQueries({
                queryKey: crmQueryKeys.shell(),
                exact: true,
              }),
            ]
          : []),
      ]);
      return result;
    } catch (error) {
      console.error(error);
      toast.error(toSafeErrorMessage(error));
      throw error;
    }
  }

  return (
    <>
      <WorkspaceHeader
        context="Personal account"
        title="Account settings"
        description="Your profile, availability, security, workload and access requests."
        status={
          updatedAt === null ? undefined : (
            <StaleDataIndicator updatedAt={updatedAt} isRefetching={accountQuery.isFetching} />
          )
        }
      />

      <div className="min-w-0 px-4 py-6 md:px-6">
        <AccountSettings
          account={accountQuery.data}
          tab={search.tab ?? "profile"}
          onTabChange={(tab: AccountTab) =>
            navigate({
              search: (current) => ({ ...current, tab: tab === "profile" ? undefined : tab }),
              replace: true,
            })
          }
          welcome={search.welcome === true}
          onUpdateProfile={(input) =>
            runMutation(() => updateMyProfile({ data: input }), "Profile updated", true)
          }
          onUpdateAvailability={(input) =>
            runMutation(() => updateMyAvailability({ data: input }), "Availability updated")
          }
          onRevokeSessions={() =>
            runMutation(() => revokeMyAppSessions({ data: {} }), "Older app sessions revoked")
          }
          onCreateDelegation={(input) =>
            runMutation(() => createMyDelegation({ data: input }), "Delegation created")
          }
          onCancelDelegation={(id) =>
            runMutation(() => cancelMyDelegation({ data: { id } }), "Delegation cancelled")
          }
          onCreateAccessRequest={(input) =>
            runMutation(() => createMyAccessRequest({ data: input }), "Access request submitted")
          }
        />
      </div>
    </>
  );
}
