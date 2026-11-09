export type WorkspaceAccessStateName =
  | "invited"
  | "suspended"
  | "deactivated"
  | "unverified"
  | "no_profile";

type WorkspaceAccessStateProps = {
  state: WorkspaceAccessStateName;
  onSignOut?: () => void;
};

type WorkspaceAccessStateMessage = {
  title: string;
  description: string;
  /** Overrides the default sign-out label when the state needs a more specific action. */
  actionLabel?: string;
};

const messages: Record<WorkspaceAccessStateName, WorkspaceAccessStateMessage> = {
  invited: {
    title: "Invitation pending",
    description:
      "Use the invitation link sent to your email address to finish setting up workspace access. Ask your administrator if you need a new invitation.",
  },
  suspended: {
    title: "Workspace access suspended",
    description: "Your account is suspended. Contact your administrator for help.",
  },
  deactivated: {
    title: "Workspace access deactivated",
    description: "Your account is deactivated. Contact your administrator for help.",
  },
  unverified: {
    title: "Verify your email address",
    description:
      "Open the verification link Neon Auth sent to your email address, then reload this page. Check your inbox and spam folder if it has not arrived.",
    actionLabel: "Use a different account",
  },
  no_profile: {
    title: "Workspace access pending",
    description:
      "Your identity is signed in, but workspace access requires an administrator invitation. Contact your administrator for help.",
  },
};

export function WorkspaceAccessState({ state, onSignOut }: WorkspaceAccessStateProps) {
  const message = messages[state];
  return (
    <section className="rounded-md border bg-card p-5 text-center" aria-live="polite">
      <h2 className="text-lg font-semibold">{message.title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{message.description}</p>
      {onSignOut && (
        <button
          type="button"
          className="mt-5 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
          onClick={onSignOut}
        >
          {message.actionLabel ?? "Sign out"}
        </button>
      )}
    </section>
  );
}
