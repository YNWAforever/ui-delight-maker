import { useEffect, useState } from "react";

import { toSafeErrorMessage } from "@/lib/errors";
import { NON_REQUESTABLE_CAPABILITIES } from "@/lib/admin/schemas";
import { CAPABILITIES, type Capability } from "@/lib/admin/types";

export type PermissionOverrideSubmit = {
  profileId: string;
  capability: Capability;
  effect: "allow" | "deny";
  reason: string;
  expiresAt: string | null;
  /** Narrows the grant to one department. Omitted means every department. */
  departmentId: string | null;
  /** Narrows the grant to one team. Omitted means every team. */
  teamId: string | null;
  /** Narrows the grant to one kind of record, e.g. `account`. */
  resourceType: string | null;
  /** Narrows the grant to one record. Only meaningful with a resource type. */
  resourceId: string | null;
};

type UnitOption = { id: string; name: string };

type PermissionOverrideDialogProps = {
  open: boolean;
  profileId: string;
  profileName: string;
  canCreateOverride: boolean;
  departments?: readonly UnitOption[];
  teams?: readonly UnitOption[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: PermissionOverrideSubmit) => Promise<unknown> | unknown;
};

/**
 * The resource kinds `resource-ownership.ts` can actually resolve.
 *
 * A free-text box here would be a way to write a scope the policy engine silently never
 * matches, which is indistinguishable from an unscoped grant except that it grants nothing.
 * The list stays short and named rather than inferred.
 */
const RESOURCE_TYPES = [
  "account",
  "lead",
  "client",
  "quote",
  "engagement",
  "job_sheet",
  "campaign",
  "task",
] as const;

/**
 * Creating an explicit permission override.
 *
 * The scope fields are the change that matters. `permissionOverrideSchema` accepts
 * `departmentId`, `teamId`, `resourceType` and `resourceId`, and `overrideIsActive` in the
 * policy engine enforces all four — but the dialog never sent them and the route never
 * forwarded them, so **every override the product could create was org-wide and unscoped**,
 * the broadest grant the engine supports, with no way to say so or to narrow it. That is a
 * security defect, not a missing convenience: an override is consulted *before* the role
 * baseline, so an unintended org-wide allow is the widest possible grant.
 *
 * The dialog now defaults to unscoped, because that is what the schema does, and says so in
 * words before the reader submits.
 */
export function PermissionOverrideDialog({
  open,
  profileId,
  profileName,
  canCreateOverride,
  departments = [],
  teams = [],
  onOpenChange,
  onSubmit,
}: PermissionOverrideDialogProps) {
  const [capability, setCapability] = useState<Capability>("accounts.view");
  const [effect, setEffect] = useState<"allow" | "deny">("allow");
  const [reason, setReason] = useState("");
  const [temporary, setTemporary] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCapability("accounts.view");
    setEffect("allow");
    setReason("");
    setTemporary(false);
    setExpiresAt("");
    setDepartmentId("");
    setTeamId("");
    setResourceType("");
    setResourceId("");
    setError(null);
  }, [open]);

  if (!open) return null;

  const unscoped = !departmentId && !teamId && !resourceType;

  async function submit() {
    if (submitting) return;
    if (reason.trim().length < 8) {
      setError("Reason is required");
      return;
    }
    if (temporary && !expiresAt) {
      setError("Expiry is required for temporary overrides");
      return;
    }
    if (resourceId && !resourceType) {
      setError("Choose a resource type before naming a single record.");
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
        departmentId: departmentId || null,
        teamId: teamId || null,
        resourceType: resourceType || null,
        resourceId: resourceId.trim() || null,
      });
      onOpenChange(false);
    } catch (submissionError) {
      setError(toSafeErrorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass =
    "mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                className={fieldClass}
              >
                {CAPABILITIES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
              {NON_REQUESTABLE_CAPABILITIES.includes(capability) ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  This capability can only be granted here. It is deliberately excluded from the
                  self-service access-request flow.
                </span>
              ) : null}
            </label>
            <label className="block">
              <span className="text-sm font-medium">Effect</span>
              <select
                aria-label="Override effect"
                value={effect}
                onChange={(event) => setEffect(event.target.value as "allow" | "deny")}
                className={fieldClass}
              >
                <option value="allow">Explicit allow</option>
                <option value="deny">Explicit deny</option>
              </select>
            </label>

            <fieldset className="rounded-md border border-border px-3 py-3">
              <legend className="px-1 text-sm font-medium">Scope</legend>
              <p className="text-xs text-muted-foreground">
                Leave every field blank and this override applies across the whole organization. An
                override is consulted before the role baseline, so an unscoped allow is the widest
                grant the system has.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-foreground">Department</span>
                  <select
                    aria-label="Override department scope"
                    value={departmentId}
                    onChange={(event) => setDepartmentId(event.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Every department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-foreground">Team</span>
                  <select
                    aria-label="Override team scope"
                    value={teamId}
                    onChange={(event) => setTeamId(event.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Every team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-foreground">Resource type</span>
                  <select
                    aria-label="Override resource type"
                    value={resourceType}
                    onChange={(event) => setResourceType(event.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Every record</option>
                    {RESOURCE_TYPES.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-foreground">Single record id</span>
                  <input
                    aria-label="Override resource id"
                    value={resourceId}
                    disabled={!resourceType}
                    onChange={(event) => setResourceId(event.target.value)}
                    placeholder={resourceType ? "Optional" : "Pick a resource type first"}
                    className={fieldClass + " disabled:opacity-60"}
                  />
                </label>
              </div>
              <p
                className={
                  "mt-3 text-xs " + (unscoped ? "text-warning-foreground" : "text-muted-foreground")
                }
              >
                {unscoped
                  ? `This override will apply everywhere in the organization.`
                  : `This override applies only within the scope selected above.`}
              </p>
            </fieldset>

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
                  className={fieldClass}
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
              {submitting ? "Creating…" : "Create override"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
