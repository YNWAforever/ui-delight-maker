import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, X } from "lucide-react";
import { ROLE_GRANTS } from "@/lib/admin/policy";
import type { UserRole } from "@/lib/admin/types";
import { toSafeErrorMessage } from "@/lib/errors";
import { getUserRoleLabel } from "@/lib/status-labels";

type UserRoleDialogProps = {
  open: boolean;
  currentRole: UserRole;
  userName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (role: UserRole, reason: string) => Promise<unknown> | unknown;
};

export function UserRoleDialog({
  open,
  currentRole,
  userName,
  onOpenChange,
  onSubmit,
}: UserRoleDialogProps) {
  const [role, setRole] = useState<UserRole>(currentRole);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Reset on open, because this dialog is hidden rather than unmounted.
   *
   * `if (!open) return null` runs *after* the hooks, so the component stays mounted and
   * `useState(currentRole)` only ever ran once. Open it for one person, pick "Admin",
   * cancel, open it for someone else: the select still read "Admin" while the header said
   * the new person's real role, and the reason typed for the first person was pre-filled
   * and would have been written to the audit log against the second. The three sibling
   * dialogs — lifecycle, organization unit, permission override — all already do this.
   */
  useEffect(() => {
    if (!open) return;
    setRole(currentRole);
    setReason("");
    setError(null);
  }, [open, currentRole, userName]);

  if (!open) return null;

  const current = ROLE_GRANTS[currentRole];
  const next = ROLE_GRANTS[role];
  const gained = [...next].filter((capability) => !current.has(capability));
  const lost = [...current].filter((capability) => !next.has(capability));

  async function submit() {
    if (role === currentRole) {
      setError("Choose a different role to continue.");
      return;
    }
    if (reason.trim().length < 8) {
      setError("Enter a reason of at least eight characters.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(role, reason.trim());
      onOpenChange(false);
    } catch (submissionError) {
      // `changeAdminUserRoleFn` reaches `requireCapability`, which runs raw SQL. Its thrown
      // text can quote the failing query, so it is filtered before a person reads it.
      setError(toSafeErrorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-dialog-title"
        className="my-8 w-full max-w-lg rounded-md border border-border bg-background shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="role-dialog-title" className="text-base font-semibold text-foreground">
              Change role
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {userName} · current role: {getUserRoleLabel(currentRole)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close role dialog"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <label className="block text-sm font-medium text-foreground">
            New role
            <select
              aria-label="New role"
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
              className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="sales">Sales</option>
              <option value="client_success">Client Success</option>
              <option value="accounting">Accounting</option>
              <option value="read_only">Read Only</option>
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <ArrowUpRight aria-hidden="true" className="h-4 w-4" /> Gained access
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {gained.length > 0 ? (
                  gained.slice(0, 8).map((item) => <li key={item}>{item}</li>)
                ) : (
                  <li>None</li>
                )}
              </ul>
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                <ArrowDownRight aria-hidden="true" className="h-4 w-4" /> Lost access
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {lost.length > 0 ? (
                  lost.slice(0, 8).map((item) => <li key={item}>{item}</li>)
                ) : (
                  <li>None</li>
                )}
              </ul>
            </div>
          </div>

          <label className="block text-sm font-medium text-foreground">
            Reason
            <textarea
              aria-label="Role change reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="min-h-9 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save role"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
