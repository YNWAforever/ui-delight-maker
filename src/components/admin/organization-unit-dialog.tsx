import { useEffect, useState } from "react";
import type {
  Department,
  DepartmentInput,
  Team,
  TeamInput,
} from "@/server/repositories/admin-teams";
import type { TeamMemberUser } from "./team-member-table";

export type OrganizationUnitKind = "department" | "team";
export type OrganizationUnitSubmit = {
  kind: OrganizationUnitKind;
  id?: string;
  input: DepartmentInput | TeamInput;
};

type OrganizationUnitDialogProps = {
  open: boolean;
  kind: OrganizationUnitKind;
  unit?: Department | Team | null;
  users: readonly TeamMemberUser[];
  openOwnedWorkCount?: number;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: OrganizationUnitSubmit) => Promise<unknown> | unknown;
};

function valueOrEmpty(value: string | null | undefined) {
  return value ?? "";
}

export function OrganizationUnitDialog({
  open,
  kind,
  unit,
  users,
  openOwnedWorkCount = 0,
  onOpenChange,
  onSubmit,
}: OrganizationUnitDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [headProfileId, setHeadProfileId] = useState("");
  const [deputyProfileId, setDeputyProfileId] = useState("");
  const [defaultOwnerProfileId, setDefaultOwnerProfileId] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isDepartment = kind === "department";
  const isArchiving = status === "archived" && unit?.status !== "archived";

  useEffect(() => {
    if (!open) return;
    setName(unit?.name ?? "");
    setDescription(
      isDepartment
        ? valueOrEmpty((unit as Department | null | undefined)?.description)
        : valueOrEmpty((unit as Team | null | undefined)?.purpose),
    );
    setHeadProfileId(
      isDepartment
        ? valueOrEmpty((unit as Department | null | undefined)?.headProfileId)
        : valueOrEmpty((unit as Team | null | undefined)?.leadProfileId),
    );
    setDeputyProfileId(valueOrEmpty(unit?.deputyProfileId));
    setDefaultOwnerProfileId(
      !isDepartment ? valueOrEmpty((unit as Team | null | undefined)?.defaultOwnerProfileId) : "",
    );
    setStatus(unit?.status ?? "active");
    setArchiveConfirmed(false);
    setError(null);
  }, [isDepartment, kind, open, unit]);

  if (!open) return null;

  async function submit() {
    if (!name.trim()) {
      setError("Organization unit name is required.");
      return;
    }
    if (isArchiving && !archiveConfirmed) {
      setError("Confirm that open ownership and active memberships have been reviewed.");
      return;
    }

    const input = isDepartment
      ? {
          name: name.trim(),
          description: description.trim() || null,
          headProfileId: headProfileId || null,
          deputyProfileId: deputyProfileId || null,
          status,
        }
      : {
          name: name.trim(),
          purpose: description.trim() || null,
          leadProfileId: headProfileId || null,
          deputyProfileId: deputyProfileId || null,
          defaultOwnerProfileId: defaultOwnerProfileId || null,
          status,
        };

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ kind, id: unit?.id, input });
      onOpenChange(false);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Could not save this organization unit.",
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
        aria-labelledby="organization-unit-dialog-title"
        className="my-8 w-full max-w-xl rounded-md border border-border bg-background shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {unit ? "Edit organization unit" : "New organization unit"}
            </p>
            <h2
              id="organization-unit-dialog-title"
              className="mt-1 text-base font-semibold text-foreground"
            >
              {unit?.name || (isDepartment ? "Create department" : "Create working team")}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close organization unit dialog"
            onClick={() => onOpenChange(false)}
            className="min-h-9 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Close
          </button>
        </div>

        <form
          className="space-y-4 px-5 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium text-foreground">Name</span>
            <input
              aria-label="Organization unit name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-foreground">
              {isDepartment ? "Description" : "Purpose"}
            </span>
            <textarea
              aria-label={isDepartment ? "Description" : "Purpose"}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <ProfileSelect
              label={isDepartment ? "Department head" : "Team lead"}
              value={headProfileId}
              users={users}
              onChange={setHeadProfileId}
            />
            <ProfileSelect
              label={isDepartment ? "Department deputy" : "Team deputy"}
              value={deputyProfileId}
              users={users}
              onChange={setDeputyProfileId}
            />
          </div>
          {!isDepartment ? (
            <ProfileSelect
              label="Default owner"
              value={defaultOwnerProfileId}
              users={users}
              onChange={setDefaultOwnerProfileId}
            />
          ) : null}
          <label className="block">
            <span className="text-sm font-medium text-foreground">Status</span>
            <select
              aria-label="Organization unit status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as "active" | "archived");
                setArchiveConfirmed(false);
              }}
              className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          {isArchiving ? (
            <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive">
              <input
                type="checkbox"
                checked={archiveConfirmed}
                onChange={(event) => setArchiveConfirmed(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                I reviewed open ownership and active memberships ({openOwnedWorkCount} open work
                record
                {openOwnedWorkCount === 1 ? "" : "s"}). Historical records will be preserved.
              </span>
            </label>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
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
              className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {submitting ? "Saving..." : unit ? "Save changes" : "Create unit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileSelect({
  label,
  value,
  users,
  onChange,
}: {
  label: string;
  value: string;
  users: readonly TeamMemberUser[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Unassigned</option>
        {users
          .filter((user) => user.status === "active")
          .map((user) => (
            <option key={user.id} value={user.id}>
              {user.name || user.email || user.id}
            </option>
          ))}
      </select>
    </label>
  );
}
