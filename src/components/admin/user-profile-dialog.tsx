import { useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { AdminError } from "@/lib/admin/errors";

export type ProfileDialogUser = {
  id: string;
  name: string | null;
  email: string | null;
  jobTitle: string | null;
  phone: string | null;
  locale: string;
  timezone: string;
  primaryDepartmentId: string | null;
  managerProfileId: string | null;
};

export type ProfileDialogDepartment = { id: string; name: string; status?: string };
export type ProfileDialogManager = { id: string; name: string | null; email: string | null };

export type ProfileChanges = {
  name?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  locale?: string;
  timezone?: string;
  primaryDepartmentId?: string | null;
  managerProfileId?: string | null;
};

type UserProfileDialogProps = {
  open: boolean;
  user: ProfileDialogUser;
  departments?: readonly ProfileDialogDepartment[];
  managers?: readonly ProfileDialogManager[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (changes: ProfileChanges) => Promise<unknown> | unknown;
};

// The server accepts any non-empty string for these two, so a typo would silently render every
// date on the member's record wrong. Constrain the choices instead. 'en-HK' / 'Asia/Hong_Kong'
// are the column defaults in neon/migrations/007.
const LOCALES = ["en-HK", "en-GB", "en-US", "zh-HK", "zh-TW", "zh-CN"] as const;
const TIMEZONES = [
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "America/New_York",
  "UTC",
] as const;

// A value already on the record must stay selectable even when it is not in the curated list,
// otherwise opening the dialog and saving would quietly rewrite it.
function withCurrent(options: readonly string[], current: string) {
  return options.includes(current) ? [...options] : [current, ...options];
}

function trimmedOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function UserProfileDialog({
  open,
  user,
  departments = [],
  managers = [],
  onOpenChange,
  onSubmit,
}: UserProfileDialogProps) {
  const [name, setName] = useState(user.name ?? "");
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [locale, setLocale] = useState(user.locale);
  const [timezone, setTimezone] = useState(user.timezone);
  const [departmentId, setDepartmentId] = useState(user.primaryDepartmentId ?? "");
  const [managerId, setManagerId] = useState(user.managerProfileId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  // Nobody reports to themselves; the option must not exist rather than fail on submit.
  const managerOptions = managers.filter((candidate) => candidate.id !== user.id);

  function collectChanges(): ProfileChanges {
    const changes: ProfileChanges = {};
    if (trimmedOrNull(name) !== user.name) changes.name = trimmedOrNull(name);
    if (trimmedOrNull(jobTitle) !== user.jobTitle) changes.jobTitle = trimmedOrNull(jobTitle);
    if (trimmedOrNull(phone) !== user.phone) changes.phone = trimmedOrNull(phone);
    if (locale !== user.locale) changes.locale = locale;
    if (timezone !== user.timezone) changes.timezone = timezone;
    if ((departmentId || null) !== user.primaryDepartmentId) {
      changes.primaryDepartmentId = departmentId || null;
    }
    if ((managerId || null) !== user.managerProfileId) {
      changes.managerProfileId = managerId || null;
    }
    return changes;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changes = collectChanges();
    if (Object.keys(changes).length === 0) {
      setError("Change at least one field to continue.");
      return;
    }
    // `name` is nullable in the schema, but a member with no name renders as their email
    // everywhere. Clearing an existing name is almost certainly a mistake.
    if (changes.name === null && user.name) {
      setError("A name cannot be removed once set.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(changes);
      onOpenChange(false);
    } catch (submissionError) {
      setError(
        submissionError instanceof AdminError || submissionError instanceof Error
          ? submissionError.message
          : "Could not update this profile.",
      );
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
        aria-labelledby="user-profile-title"
        className="my-8 w-full max-w-lg rounded-md border border-border bg-background shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="user-profile-title" className="text-base font-semibold text-foreground">
              Edit profile
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {user.name || user.email || "Unnamed user"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close profile dialog"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-foreground">
              Name
              <input
                aria-label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Job title
              <input
                aria-label="Job title"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Phone
              <input
                aria-label="Phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Locale
              <select
                aria-label="Locale"
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
                className={fieldClass}
              >
                {withCurrent(LOCALES, user.locale).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-foreground">
              Timezone
              <select
                aria-label="Timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className={fieldClass}
              >
                {withCurrent(TIMEZONES, user.timezone).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-foreground">
              Department
              <select
                aria-label="Department"
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                className={fieldClass}
              >
                <option value="">No department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-foreground">
              Manager
              <select
                aria-label="Manager"
                value={managerId}
                onChange={(event) => setManagerId(event.target.value)}
                className={fieldClass}
              >
                <option value="">No manager</option>
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name || manager.email || manager.id}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
              {submitting ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
