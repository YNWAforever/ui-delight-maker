import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AdminError } from "@/lib/admin/errors";
import type { ProfileStatus, UserRole } from "@/lib/admin/types";
import type {
  DeactivateUserWithReassignmentInput,
  ReassignmentBucketKey,
  ReassignmentInventory,
} from "@/server/admin/reassignment.server";
import { WorkReassignmentTable } from "./work-reassignment-table";
import type { LifecycleSuccessorOption } from "./work-reassignment-table";

type LifecycleUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  status: ProfileStatus;
};

export type UserLifecycleAction = "suspend" | "reactivate" | "deactivate";

export type UserLifecycleSubmit = {
  action: UserLifecycleAction;
  profileId: string;
  reason: string;
  reviewedInventory: DeactivateUserWithReassignmentInput["reviewedInventory"];
  successors: Partial<Record<ReassignmentBucketKey, string>>;
};

type UserLifecycleDialogProps = {
  open: boolean;
  user: LifecycleUser;
  initialAction?: UserLifecycleAction;
  inventory?: ReassignmentInventory;
  successors?: readonly LifecycleSuccessorOption[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: UserLifecycleSubmit) => Promise<unknown> | unknown;
};

// Suspending an already-suspended member is a no-op, and reactivating anyone else is
// meaningless, so the pair on offer follows the member's current status. Deactivate is always
// available because it is reachable from every non-deactivated status.
function actionsForStatus(status: ProfileStatus): UserLifecycleAction[] {
  return status === "suspended" ? ["reactivate", "deactivate"] : ["suspend", "deactivate"];
}

const ACTION_LABELS: Record<UserLifecycleAction, string> = {
  suspend: "Suspend",
  reactivate: "Restore",
  deactivate: "Deactivate",
};

const ACTION_DESCRIPTIONS: Record<UserLifecycleAction, string> = {
  suspend:
    "Suspension immediately removes app access and invalidates active sessions. The profile and ownership history remain.",
  reactivate:
    "Restoring returns app access and clears the suspension record. Existing sessions stay invalidated, so this member signs in again. Team memberships were never ended by the suspension and need no action.",
  deactivate:
    "Deactivation is permanent operationally. Review and reassign every open ownership bucket before continuing.",
};

const SUBMIT_LABELS: Record<UserLifecycleAction, string> = {
  suspend: "Suspend user",
  reactivate: "Restore access",
  deactivate: "Deactivate user",
};

export function UserLifecycleDialog({
  open,
  user,
  initialAction,
  inventory,
  successors = [],
  onOpenChange,
  onSubmit,
}: UserLifecycleDialogProps) {
  const availableActions = actionsForStatus(user.status);
  // A caller asking for "suspend" on an already-suspended member would otherwise select an
  // action the toggle never renders, leaving the dialog stuck on an invisible selection.
  const resolvedInitialAction =
    initialAction && availableActions.includes(initialAction) ? initialAction : availableActions[0];
  const [action, setAction] = useState<UserLifecycleAction>(resolvedInitialAction);
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<Partial<Record<ReassignmentBucketKey, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAction(resolvedInitialAction);
      setReason("");
      setSelected({});
      setError(null);
    }
  }, [resolvedInitialAction, open, user.id]);

  if (!open) return null;

  const openBuckets = inventory?.buckets.filter((bucket) => bucket.count > 0) ?? [];
  const hasAllSuccessors =
    action === "deactivate" &&
    Boolean(inventory) &&
    openBuckets.every((bucket) => Boolean(selected[bucket.key]?.trim()));
  // Only deactivation reassigns work. Gating the other actions on the inventory would make
  // reactivate permanently unsubmittable, because nothing is ever loaded for it.
  const canSubmit = action !== "deactivate" || (Boolean(inventory) && hasAllSuccessors);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 8) {
      setError("Enter a reason with at least eight characters.");
      return;
    }
    if (action === "deactivate" && (!inventory || !hasAllSuccessors)) {
      setError("Assign an active successor for every open work area.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        action,
        profileId: user.id,
        reason: reason.trim(),
        reviewedInventory: inventory ?? {
          profileId: user.id,
          buckets: [],
          totalCount: 0,
        },
        successors: selected,
      });
      onOpenChange(false);
    } catch (submissionError) {
      setError(
        submissionError instanceof AdminError || submissionError instanceof Error
          ? submissionError.message
          : "Could not update this user's lifecycle status.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-lifecycle-title"
        className="my-8 w-full max-w-2xl rounded-md border border-border bg-background shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              User lifecycle
            </p>
            <h2 id="user-lifecycle-title" className="mt-1 text-base font-semibold text-foreground">
              {user.name || user.email || "Unnamed user"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Access changes are audited and preserve the user's business history.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close lifecycle dialog"
            onClick={() => onOpenChange(false)}
            className="min-h-9 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Close
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-5">
          <div className="flex flex-wrap gap-2">
            {availableActions.map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={action === candidate}
                onClick={() => {
                  setAction(candidate);
                  setError(null);
                }}
                className={
                  "min-h-9 rounded-md border px-3 py-2 text-sm font-medium " +
                  (action === candidate
                    ? candidate === "deactivate"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent")
                }
              >
                {ACTION_LABELS[candidate]}
              </button>
            ))}
          </div>

          <div
            className="rounded-md border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
            role="status"
          >
            {ACTION_DESCRIPTIONS[action]}
          </div>

          {action === "deactivate" ? (
            inventory ? (
              <WorkReassignmentTable
                inventory={inventory}
                targetProfileId={user.id}
                successors={successors}
                selected={selected}
                onChange={(bucket, successorId) =>
                  setSelected((current) => ({ ...current, [bucket]: successorId }))
                }
              />
            ) : (
              <div className="rounded-md border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                Load the current ownership inventory before deactivation.
              </div>
            )
          ) : null}

          <label className="block">
            <span className="text-sm font-medium text-foreground">Reason</span>
            <textarea
              aria-label="Reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="min-h-9 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className={
                "min-h-9 rounded-md px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (action === "reactivate"
                  ? "bg-primary text-primary-foreground"
                  : "bg-destructive text-destructive-foreground")
              }
            >
              {submitting ? "Updating..." : SUBMIT_LABELS[action]}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
