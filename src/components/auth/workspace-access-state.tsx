export type WorkspaceAccessStateName = "invited" | "suspended" | "deactivated" | "no_profile";

type WorkspaceAccessStateProps = {
  state: WorkspaceAccessStateName;
  onSignOut?: () => void;
};

const messages: Record<WorkspaceAccessStateName, { title: string; description: string }> = {
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
          Sign out
        </button>
      )}
    </section>
  );
}
