import { useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { AdminError } from "@/lib/admin/errors";
import { formatDateTime } from "@/lib/format";

export type DelegationDialogUser = {
  id: string;
  name: string | null;
  email: string | null;
  availabilityStatus?: string;
  leaveStartsAt?: string | null;
  leaveEndsAt?: string | null;
};

export type DelegationCandidate = { id: string; name: string | null; email: string | null };

export type WorkDelegationSubmit = {
  delegatorProfileId: string;
  delegateProfileId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
};

type WorkDelegationDialogProps = {
  open: boolean;
  user: DelegationDialogUser;
  candidates?: readonly DelegationCandidate[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: WorkDelegationSubmit) => Promise<unknown> | unknown;
};

// `delegationSchema` uses z.iso.datetime(), which rejects the bare `YYYY-MM-DD` a date input
// produces. datetime-local gives `YYYY-MM-DDTHH:mm`, still short of an ISO instant, so widen it
// here rather than let the server reject a form the admin filled in correctly.
function toIsoInstant(localValue: string) {
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function WorkDelegationDialog({
  open,
  user,
  candidates = [],
  onOpenChange,
  onSubmit,
}: WorkDelegationDialogProps) {
  const [delegateId, setDelegateId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const delegateOptions = candidates.filter((candidate) => candidate.id !== user.id);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!delegateId) {
      setError("Choose the person who will cover this work.");
      return;
    }
    // Mirrors delegationSchema.superRefine so the admin sees the problem in the form.
    if (delegateId === user.id) {
      setError("A member cannot delegate to themselves.");
      return;
    }
    const startIso = toIsoInstant(startsAt);
    const endIso = toIsoInstant(endsAt);
    if (!startIso || !endIso) {
      setError("Enter both a start and an end date.");
      return;
    }
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      setError("The end date must be after the start date.");
      return;
    }
    if (reason.trim().length < 8) {
      setError("Enter a reason with at least eight characters.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        delegatorProfileId: user.id,
        delegateProfileId: delegateId,
        startsAt: startIso,
        endsAt: endIso,
        reason: reason.trim(),
      });
      onOpenChange(false);
    } catch (submissionError) {
      setError(
        submissionError instanceof AdminError || submissionError instanceof Error
          ? submissionError.message
          : "Could not create this delegation.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass =
    "mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const leaveWindow =
    user.leaveStartsAt || user.leaveEndsAt
      ? [
          user.leaveStartsAt ? formatDateTime(user.leaveStartsAt) : "unset",
          user.leaveEndsAt ? formatDateTime(user.leaveEndsAt) : "unset",
        ].join(" → ")
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-delegation-title"
        className="my-8 w-full max-w-lg rounded-md border border-border bg-background shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="work-delegation-title" className="text-base font-semibold text-foreground">
              Delegate work
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {user.name || user.email || "Unnamed user"}
              {user.availabilityStatus ? ` · ${user.availabilityStatus}` : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close delegation dialog"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-5">
          {leaveWindow ? (
            <div
              role="status"
              className="rounded-md border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
            >
              Recorded leave: {leaveWindow}
            </div>
          ) : null}

          <label className="block text-sm font-medium text-foreground">
            Delegate to
            <select
              aria-label="Delegate to"
              value={delegateId}
              onChange={(event) => setDelegateId(event.target.value)}
              className={fieldClass}
            >
              <option value="">Select a person</option>
              {delegateOptions.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name || candidate.email || candidate.id}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-foreground">
              Starts
              <input
                aria-label="Starts"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Ends
              <input
                aria-label="Ends"
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                className={fieldClass}
              />
            </label>
          </div>

          <label className="block text-sm font-medium text-foreground">
            Reason
            <textarea
              aria-label="Delegation reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              disabled={submitting}
              className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {submitting ? "Saving…" : "Create delegation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
