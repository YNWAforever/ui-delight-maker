import { createFileRoute, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { AccountSettings } from "@/components/account/account-settings";
import {
  cancelMyDelegation,
  createMyAccessRequest,
  createMyDelegation,
  getMyAccount,
  revokeMyAppSessions,
  updateMyAvailability,
  updateMyProfile,
} from "@/server-functions/account";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [{ title: "Account - Fimmick ClientOps" }],
  }),
  loader: () => getMyAccount(),
  component: AccountPage,
});

function AccountPage() {
  const account = Route.useLoaderData();
  const router = useRouter();

  async function runMutation<T>(action: () => Promise<T>, successMessage: string) {
    try {
      const result = await action();
      toast.success(successMessage);
      await router.invalidate();
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your account");
      throw error;
    }
  }

  return (
    <div className="min-w-0">
      <AccountSettings
        account={account}
        onUpdateProfile={(input) =>
          runMutation(() => updateMyProfile({ data: input }), "Profile updated")
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
