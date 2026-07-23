import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AccountSettings } from "@/components/account/account-settings";
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

const accountQueryKey = crmQueryKeys.account.detail("me");

const accountQueryOptions = () =>
  routeQueryOptions({
    queryKey: accountQueryKey,
    queryFn: () => getMyAccount(),
  });

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [{ title: "Account - Fimmick ClientOps" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(accountQueryOptions()),
  component: AccountPage,
});

function AccountPage() {
  const loadedAccount = Route.useLoaderData();
  const queryClient = useQueryClient();
  const accountQuery = useQuery({
    ...accountQueryOptions(),
    initialData: loadedAccount,
  });

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
      toast.error(error instanceof Error ? error.message : "Could not update your account");
      throw error;
    }
  }

  return (
    <div className="min-w-0">
      <AccountSettings
        account={accountQuery.data}
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
  );
}
