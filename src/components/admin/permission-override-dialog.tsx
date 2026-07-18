import { useEffect, useState } from "react";
import { CAPABILITIES, type Capability } from "@/lib/admin/types";

export type PermissionOverrideSubmit = {
  profileId: string;
  capability: Capability;
  effect: "allow" | "deny";
  reason: string;
  expiresAt: string | null;
};

type PermissionOverrideDialogProps = {
  open: boolean;
  profileId: string;
  profileName: string;
  canCreateOverride: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: PermissionOverrideSubmit) => Promise<unknown> | unknown;
};

export function PermissionOverrideDialog({
  open,
  profileId,
  profileName,
  canCreateOverride,
  onOpenChange,
  onSubmit,
}: PermissionOverrideDialogProps) {
  const [capability, setCapability] = useState<Capability>("accounts.view");
  const [effect, setEffect] = useState<"allow" | "deny">("allow");
  const [reason, setReason] = useState("");
  const [temporary, setTemporary] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCapability("accounts.view");
    setEffect("allow");
    setReason("");
    setTemporary(false);
    setExpiresAt("");
    setError(null);
  }, [open]);

  if (!open) return null;

  async function submit() {
    if (reason.trim().length < 8) {
      setError("Reason is required");
      return;
    }
    if (temporary && !expiresAt) {
      setError("Expiry is required for temporary overrides");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        profileId,
        capability,
        effect,
        reason: reason.trim(),
        expiresAt: temporary ? new Date(expiresAt).toISOString() : null,
      });
      onOpenChange(false);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Could not create this permission override.",
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
        aria-labelledby="permission-override-dialog-title"
        className="my-8 w-full max-w-xl rounded-md border border-border bg-background shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Permission override
            </p>
            <h2 id="permission-override-dialog-title" className="mt-1 text-base font-semibold">
              {profileName}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close permission override dialog"
            onClick={() => onOpenChange(false)}
            className="min-h-9 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
          >
            Close
          </button>
        </div>

        {!canCreateOverride ? (
          <p
            role="alert"
            className="m-5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive"
          >
            Only Super Admin can create permission overrides.
          </p>
        ) : (
          <form
            className="space-y-4 px-5 py-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="block">
              <span className="text-sm font-medium">Capability</span>
              <select
                aria-label="Override capability"
                value={capability}
                onChange={(event) => setCapability(event.target.value as Capability)}
                className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {CAPABILITIES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Effect</span>
              <select
                aria-label="Override effect"
                value={effect}
                onChange={(event) => setEffect(event.target.value as "allow" | "deny")}
                className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="allow">Explicit allow</option>
                <option value="deny">Explicit deny</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Reason</span>
              <textarea
                aria-label="Override reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError(null);
                }}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label="Temporary override"
                checked={temporary}
                onChange={(event) => setTemporary(event.target.checked)}
              />
              Temporary override
            </label>
            {temporary ? (
              <label className="block">
                <span className="text-sm font-medium">Override expiry</span>
                <input
                  type="datetime-local"
                  aria-label="Override expiry"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create override"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
